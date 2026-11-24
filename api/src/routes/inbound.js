import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth/index.js';
import { config } from '../config.js';
import { findUserByInboundToken, findInboundToken, setInboundToken } from '../data/users.js';
import { importTrendFiles, isTrendFilename } from '../logic/uploads/index.js';
import { importFhdbFile, isFhdbFilename, resolveFhdbAircraft } from '../logic/faults/index.js';
import { sendEmail } from '../lib/email.js';
import { createLogger, handleError } from '../lib/logging/index.js';

const logger = createLogger('inbound');
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 20 } });

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const newInboundToken = () => crypto.randomBytes(10).toString('hex');

function inboundAddress(token) {
  const { inboundPrefix, inboundDomain } = config.mailgun;
  return `${inboundPrefix}+${token}@${inboundDomain}`;
}

const safeEqual = (expected, actual) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(actual));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Mailgun signs every forwarded message: HMAC-SHA256(signingKey, timestamp + token)
function verifyMailgunSignature({ timestamp, token, signature }) {
  const { webhookSigningKey } = config.mailgun;
  if (!webhookSigningKey || !timestamp || !token || !signature) return false;
  return safeEqual(crypto.createHmac('sha256', webhookSigningKey).update(timestamp + token).digest('hex'), signature);
}

// Alternative to the signing key: a secret path segment only the Mailgun route knows,
// for accounts whose signing key is shared with other apps
function verifyUrlSecret(secret) {
  const { inboundUrlSecret } = config.mailgun;
  return Boolean(inboundUrlSecret && secret) && safeEqual(inboundUrlSecret, secret);
}

const inboundEnabled = () => {
  const { webhookSigningKey, inboundUrlSecret, inboundDomain } = config.mailgun;
  return Boolean((webhookSigningKey || inboundUrlSecret) && inboundDomain);
};

// Ignore duplicate deliveries of the same message (Mailgun retries reuse its token)
const seenTokens = new Set();
function markSeen(token) {
  if (seenTokens.has(token)) return false;
  seenTokens.add(token);
  if (seenTokens.size > 1000) seenTokens.delete(seenTokens.values().next().value);
  return true;
}

function findTokenInRecipients(recipients) {
  const { inboundPrefix, inboundDomain } = config.mailgun;
  const re = new RegExp(`^${escapeRegex(inboundPrefix)}\\+([a-f0-9]+)@${escapeRegex(inboundDomain)}$`, 'i');
  for (const r of String(recipients || '').split(',')) {
    const m = r.trim().match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

async function emailImportSummary({ user, subject: emailSubject, results }) {
  const imported = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const aircraft = imported[0]?.result;
  const link = aircraft ? `${config.appUrl}/aircraft/${aircraft.aircraftId}` : null;

  let subject;
  if (!results.length) subject = 'Trend import: no files found';
  else if (!failed.length) subject = `Trend import: ${imported.length} file${imported.length > 1 ? 's' : ''} imported${aircraft ? ` for ${aircraft.tailNumber}` : ''}`;
  else if (!imported.length) subject = 'Trend import failed';
  else subject = `Trend import: ${imported.length} imported, ${failed.length} failed`;

  const describe = (r) => {
    if (!r.ok) return `✗ ${r.originalname}: ${r.error}`;
    if (r.kind === 'fhdb') return `✓ ${r.originalname}: ${r.result.legs} flight legs, ${r.result.faults} fault events for ${r.result.tailNumber}`;
    return `✓ ${r.originalname}: ${r.result.cruiseRecords} cruise snapshots, ${r.result.engineSeconds} engine records, ${r.result.navSeconds} nav points, ${r.result.exceedances} exceedances`;
  };
  const lines = results.length
    ? results.map(describe)
    : ['No .zip or .txt attachments were found in your email. Attach the ACMS ZIP or TXT files, or the FHDB ZIP, and send it again.'];
  const intro = `Results for your email${emailSubject ? ` "${emailSubject}"` : ''}:`;

  await sendEmail({
    to: user.email,
    subject,
    text: [intro, '', ...lines, ...(link ? ['', `View analysis: ${link}`] : [])].join('\n'),
    html: `<p>${escapeHtml(intro)}</p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      + (link ? `<p><a href="${link}">View analysis</a></p>` : ''),
  });
}

async function importFhdbFiles({ userId, files, subject, trendResults }) {
  const aircraftIdFromEmail = trendResults.find(r => r.ok)?.result.aircraftId ?? null;
  const results = [];
  for (const file of files) {
    try {
      const aircraft = await resolveFhdbAircraft({ userId, originalname: file.originalname, subject, aircraftIdFromEmail });
      if (!aircraft) throw new Error("Couldn't tell which aircraft this fault history belongs to. Put the tail number in the email subject and send it again.");
      const result = await importFhdbFile({ userId, buffer: file.buffer, originalname: file.originalname, aircraftId: aircraft.id });
      results.push({ originalname: file.originalname, kind: 'fhdb', ok: true, result });
    } catch (err) {
      results.push({ originalname: file.originalname, kind: 'fhdb', ok: false, error: err.message });
    }
  }
  return results;
}

// Mailgun inbound route target: forward("https://<api-host>/api/inbound/mailgun")
// or, with MAILGUN_INBOUND_URL_SECRET, forward("https://<api-host>/api/inbound/mailgun/<secret>")
router.post(['/mailgun', '/mailgun/:secret'], upload.any(), async (req, res) => {
  const { webhookSigningKey, inboundUrlSecret } = config.mailgun;
  if (!webhookSigningKey && !inboundUrlSecret) {
    logger.error('Neither MAILGUN_WEBHOOK_SIGNING_KEY nor MAILGUN_INBOUND_URL_SECRET set — rejecting inbound email');
    return res.status(503).json({ error: 'Inbound email not configured' });
  }
  if (!verifyUrlSecret(req.params.secret) && !verifyMailgunSignature(req.body)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!markSeen(req.body.token)) return res.json({ ok: true, duplicate: true });

  const inboundToken = findTokenInRecipients(req.body.recipient);
  const user = inboundToken ? await findUserByInboundToken({ token: inboundToken }) : null;
  // 406 tells Mailgun to drop the message without retrying
  if (!user) return res.status(406).json({ error: 'Unknown recipient' });

  const attachments = req.files || [];
  const fhdbFiles = attachments.filter(f => isFhdbFilename(f.originalname));
  const files = attachments.filter(f => isTrendFilename(f.originalname) && !isFhdbFilename(f.originalname));
  logger.info({ userId: user.id, sender: req.body.sender, files: [...files, ...fhdbFiles].map(f => f.originalname) }, 'Inbound trend email');

  // Acknowledge right away; parsing large files can outlast Mailgun's timeout
  res.json({ ok: true });

  try {
    const results = files.length ? await importTrendFiles({ userId: user.id, files }) : [];
    results.push(...await importFhdbFiles({ userId: user.id, files: fhdbFiles, subject: req.body.subject, trendResults: results }));
    await emailImportSummary({ user, subject: req.body.subject, results });
  } catch (err) {
    handleError(err, { userId: user.id, context: 'inbound email import' });
  }
});

router.get('/address', requireAuth, async (req, res) => {
  try {
    let token = await findInboundToken({ id: req.user.userId });
    if (!token) {
      token = newInboundToken();
      await setInboundToken({ id: req.user.userId, token });
    }
    res.json({ address: inboundAddress(token), enabled: inboundEnabled() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/address/regenerate', requireAuth, async (req, res) => {
  try {
    const token = newInboundToken();
    await setInboundToken({ id: req.user.userId, token });
    res.json({ address: inboundAddress(token), enabled: inboundEnabled() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
