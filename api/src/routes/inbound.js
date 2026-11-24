import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth/index.js';
import { config } from '../config.js';
import { findUserByInboundToken, findInboundToken, setInboundToken } from '../data/users.js';
import { importTrendFiles, isTrendFilename } from '../logic/uploads/index.js';
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

// Mailgun signs every forwarded message: HMAC-SHA256(signingKey, timestamp + token)
function verifyMailgunSignature({ timestamp, token, signature }) {
  if (!timestamp || !token || !signature) return false;
  const expected = crypto.createHmac('sha256', config.mailgun.webhookSigningKey).update(timestamp + token).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

  const describe = (r) => r.ok
    ? `✓ ${r.originalname}: ${r.result.cruiseRecords} cruise snapshots, ${r.result.engineSeconds} engine records, ${r.result.navSeconds} nav points, ${r.result.exceedances} exceedances`
    : `✗ ${r.originalname}: ${r.error}`;
  const lines = results.length
    ? results.map(describe)
    : ['No .zip or .txt attachments were found in your email. Attach the ACMS ZIP or TXT files and send it again.'];
  const intro = `Results for your email${emailSubject ? ` "${emailSubject}"` : ''}:`;

  await sendEmail({
    to: user.email,
    subject,
    text: [intro, '', ...lines, ...(link ? ['', `View analysis: ${link}`] : [])].join('\n'),
    html: `<p>${escapeHtml(intro)}</p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      + (link ? `<p><a href="${link}">View analysis</a></p>` : ''),
  });
}

// Mailgun inbound route target: forward("https://<api-host>/api/inbound/mailgun")
router.post('/mailgun', upload.any(), async (req, res) => {
  if (!config.mailgun.webhookSigningKey) {
    logger.error('MAILGUN_WEBHOOK_SIGNING_KEY not set — rejecting inbound email');
    return res.status(503).json({ error: 'Inbound email not configured' });
  }
  if (!verifyMailgunSignature(req.body)) return res.status(401).json({ error: 'Invalid signature' });
  if (!markSeen(req.body.token)) return res.json({ ok: true, duplicate: true });

  const inboundToken = findTokenInRecipients(req.body.recipient);
  const user = inboundToken ? await findUserByInboundToken({ token: inboundToken }) : null;
  // 406 tells Mailgun to drop the message without retrying
  if (!user) return res.status(406).json({ error: 'Unknown recipient' });

  const files = (req.files || []).filter(f => isTrendFilename(f.originalname));
  logger.info({ userId: user.id, sender: req.body.sender, files: files.map(f => f.originalname) }, 'Inbound trend email');

  // Acknowledge right away; parsing large files can outlast Mailgun's timeout
  res.json({ ok: true });

  try {
    const results = files.length ? await importTrendFiles({ userId: user.id, files }) : [];
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
    const { webhookSigningKey, inboundDomain } = config.mailgun;
    res.json({ address: inboundAddress(token), enabled: Boolean(webhookSigningKey && inboundDomain) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/address/regenerate', requireAuth, async (req, res) => {
  try {
    const token = newInboundToken();
    await setInboundToken({ id: req.user.userId, token });
    const { webhookSigningKey, inboundDomain } = config.mailgun;
    res.json({ address: inboundAddress(token), enabled: Boolean(webhookSigningKey && inboundDomain) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
