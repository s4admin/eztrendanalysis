import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth/index.js';
import { findAircraftById, findOrCreateAircraftByTail } from '../data/aircraft.js';
import { insertUpload } from '../data/uploads.js';
import { getPool } from '../data/db.js';
import { insertFlightLegs, insertFaultEvents, insertFdeCorrelations, findFaultSummary, findRecentActiveFaults, findFlightLegsByAircraft } from '../data/faults.js';
import { parseFhdbZip } from '../logic/analysis/fhdb.js';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Upload FHDB ZIP
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fname = req.file.originalname.toLowerCase();
    if (!fname.endsWith('.zip')) return res.status(400).json({ error: 'Upload the FHDB folder as a ZIP file' });

    const parsed = await parseFhdbZip(req.file.buffer);
    const { legs, faults, fde, downloadId } = parsed;

    if (!legs.length && !faults.length) {
      return res.status(400).json({ error: 'No FHDB data found. Make sure the ZIP contains FlightLegs.fhd and FPFaultHistory.fhd' });
    }

    // Extract serial from folder name: FHDB_PC12_LDI_10_11_04_0461097_20260204215138
    const serialMatch = req.file.originalname.match(/_(d{7})_/);
    const aircraftSerial = serialMatch ? serialMatch[1] : null;

    let aircraft;
    const providedId = req.body.aircraftId ? Number(req.body.aircraftId) : null;
    if (providedId) {
      aircraft = await findAircraftById({ id: providedId, userId: req.user.userId });
      if (!aircraft) return res.status(404).json({ error: 'Aircraft not found' });
    } else {
      return res.status(400).json({ error: 'Select an aircraft to associate this FHDB data with.' });
    }

    const uploadId = await insertUpload({
      aircraftId: aircraft.id, userId: req.user.userId,
      filename: req.file.originalname,
      recordCount: 0,
      engineSecondsCount: 0,
      navSecondsCount: legs.length,
      engineId: aircraftSerial || ''
    });

    // Update leg/fault counts on upload record
    const pool = getPool();
    await pool.query('UPDATE uploads SET fhdb_legs_count = ?, fhdb_faults_count = ? WHERE id = ?',
      [legs.length, faults.length, uploadId]);

    const aid = aircraft.id;
    await insertFlightLegs(legs.map(r => ({ ...r, uploadId, aircraftId: aid })));
    await insertFaultEvents(faults.map(r => ({ ...r, uploadId, aircraftId: aid })));
    if (fde.length) await insertFdeCorrelations(fde.map(r => ({ ...r, uploadId, aircraftId: aid })));

    res.status(201).json({
      uploadId, legs: legs.length, faults: faults.length, fde: fde.length, downloadId
    });
  } catch (err) {
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
