import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth/index.js';
import { findAircraftById } from '../data/aircraft.js';
import { findFaultSummary, findRecentActiveFaults, findFlightLegsByAircraft } from '../data/faults.js';
import { importFhdbFile } from '../logic/faults/index.js';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Upload FHDB ZIP
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await importFhdbFile({
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

router.get('/aircraft/:id/summary', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  const [summary, recent, legs] = await Promise.all([
    findFaultSummary({ aircraftId: aircraft.id }),
    findRecentActiveFaults({ aircraftId: aircraft.id }),
    findFlightLegsByAircraft({ aircraftId: aircraft.id }),
  ]);
  res.json({ summary, recent, legs });
});

export default router;
