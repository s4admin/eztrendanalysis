import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { signToken } from '../../lib/auth/index.js';
import { findUserByEmail, findUserById, insertUser, updateLastLogin, findUserByResetToken, setResetToken, clearResetToken } from '../../data/users.js';
import { sendEmail } from '../../lib/email.js';
import { config } from '../../config.js';

// The user fields sent to the browser, plus whether they can see the admin pages
export const toClientUser = (user) => user && ({
  id: user.id, name: user.name, email: user.email, created_at: user.created_at, last_login_at: user.last_login_at,
  isAdmin: user.email === config.adminEmail,
});

export async function login({ email, password }) {
  const user = await findUserByEmail({ email });
  if (!user) return null;
  const match = await bcrypt.compare(password, user.encrypted_password);
  if (!match) return null;
  await updateLastLogin({ id: user.id });
  return { token: signToken({ userId: user.id }), user: toClientUser(await findUserById({ id: user.id })) };
}

export async function register({ name, email, password }) {
  const existing = await findUserByEmail({ email });
  if (existing) throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_TAKEN' });
  const hash = await bcrypt.hash(password, 12);
  const id = await insertUser({ name, email, hash });
  const user = await findUserById({ id });
  return { token: signToken({ userId: id }), user: toClientUser(user) };
}

export async function requestPasswordReset({ email, appUrl }) {
  const user = await findUserByEmail({ email });
  if (!user) return;
  const token = crypto.randomBytes(32).toString('hex');
  await setResetToken({ id: user.id, token });
  const link = `${appUrl}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your EZ Trend Analysis password',
    text: `Click the link below to reset your password. It expires in 1 hour.\n\n${link}`,
    html: `<p>Click the link to reset your password (expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`
  });
}

export async function resetPassword({ token, password }) {
  const user = await findUserByResetToken({ token });
  if (!user) throw Object.assign(new Error('Invalid or expired token'), { code: 'INVALID_TOKEN' });
  const sentAt = new Date(user.reset_password_sent_at);
  if (Date.now() - sentAt.getTime() > 60 * 60 * 1000) {
    throw Object.assign(new Error('Invalid or expired token'), { code: 'INVALID_TOKEN' });
  }
  const hash = await bcrypt.hash(password, 12);
  await clearResetToken({ id: user.id, passwordHash: hash });
}
