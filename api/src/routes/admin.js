import { Router } from 'express';
import { requireAuth } from '../lib/auth/index.js';
import { findUserById, findAllUsers } from '../data/users.js';
import { config } from '../config.js';
import { getPool } from '../data/db.js';

const router = Router();
router.use(requireAuth);
router.use(async (req, res, next) => {
  const user = await findUserById({ id: req.user.userId });
  if (!user || user.email !== config.adminEmail) return res.status(403).json({ error: 'Forbidden' });
  next();
});

router.get('/users', async (req, res) => {
  try { res.json(await findAllUsers()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const target = await findUserById({ id: userId });
    if (target?.email === config.adminEmail) return res.status(403).json({ error: 'Cannot delete admin account' });
    await getPool().query('DELETE FROM users WHERE id = ?', [userId]);
    res.status(204).end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
