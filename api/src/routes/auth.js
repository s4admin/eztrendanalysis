import { Router } from 'express';
import { login, register, requestPasswordReset, resetPassword } from '../logic/auth/index.js';
import { requireAuth } from '../lib/auth/index.js';
import { findUserById } from '../data/users.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await login({ email, password });
    if (!result) return res.status(400).json({ error: 'Invalid email or password' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const result = await register({ name, email, password });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await findUserById({ id: req.user.userId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const appUrl = req.headers.origin || 'http://localhost:5173';
    await requestPasswordReset({ email, appUrl });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    await resetPassword({ token, password });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'INVALID_TOKEN') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
