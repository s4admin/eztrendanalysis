import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth/index.js';
import { findAircraftById } from '../data/aircraft.js';
import { findUploadById, findRecordsByUpload, findEngineSecondsByUpload, findNavSecondsByUpload, findExceedancesByUpload, deleteUpload } from '../data/uploads.js';
import { importTrendFile } from '../logic/uploads/index.js';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await importTrendFile({
      userId: req.user.userId,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      aircraftId: req.body.aircraftId ? Number(req.body.aircraftId) : null,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/records', async (req, res) => {
  const upload = await findUploadById({ id: Number(req.params.id) });
  if (!upload) return res.status(404).json({ error: 'Not found' });
  const records = await findRecordsByUpload({ uploadId: upload.id });
  res.json(records);
});

router.get('/:id/engine-seconds', async (req, res) => {
  const upload = await findUploadById({ id: Number(req.params.id) });
  if (!upload) return res.status(404).json({ error: 'Not found' });
  const sample = Number(req.query.sample) || 30;
  const records = await findEngineSecondsByUpload({ uploadId: upload.id, sample });
  res.json(records);
});

router.get('/:id/nav-track', async (req, res) => {
  const upload = await findUploadById({ id: Number(req.params.id) });
  if (!upload) return res.status(404).json({ error: 'Not found' });
  const sample = Number(req.query.sample) || 10;
  const records = await findNavSecondsByUpload({ uploadId: upload.id, sample });
  res.json(records);
});

router.get('/:id/exceedances', async (req, res) => {
  const upload = await findUploadById({ id: Number(req.params.id) });
  if (!upload) return res.status(404).json({ error: 'Not found' });
  res.json(await findExceedancesByUpload({ uploadId: upload.id }));
});

router.delete('/:id', async (req, res) => {
  try {
    const upload = await findUploadById({ id: Number(req.params.id) });
    if (!upload) return res.status(404).json({ error: 'Not found' });
    // Verify ownership via aircraft
    const aircraft = await findAircraftById({ id: upload.aircraft_id, userId: req.user.userId });
    if (!aircraft) return res.status(403).json({ error: 'Forbidden' });
    await deleteUpload({ id: upload.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
