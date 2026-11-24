import { Router } from 'express';
import { requireAuth } from '../lib/auth/index.js';
import { findAircraftByUser, findAircraftById, insertAircraft, updateAircraft, deleteAircraft } from '../data/aircraft.js';
import { findUploadsByAircraft, findRecordsByAircraft, findExceedancesByAircraft, findEngineSecondsByAircraft, findLoadFactorDaysByAircraft } from '../data/uploads.js';
import { analyzeTrend } from '../logic/analysis/index.js';
import { findFaultSummary } from '../data/faults.js';
import { writeTrendReport } from '../logic/reports/trend-pdf.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await findAircraftByUser({ userId: req.user.userId }));
});

router.post('/', async (req, res) => {
  try {
    const { tailNumber, makeModel, engineType, engineSerial, year, notes } = req.body;
    if (!tailNumber) return res.status(400).json({ error: 'Tail number required' });
    const id = await insertAircraft({ userId: req.user.userId, tailNumber, makeModel, engineType, engineSerial, year, notes });
    res.status(201).json(await findAircraftById({ id }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(aircraft);
});

router.put('/:id', async (req, res) => {
  try {
    await updateAircraft({ id: Number(req.params.id), userId: req.user.userId }, req.body);
    res.json(await findAircraftById({ id: Number(req.params.id) }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteAircraft({ id: Number(req.params.id), userId: req.user.userId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/uploads', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(await findUploadsByAircraft({ aircraftId: aircraft.id }));
});

router.get('/:id/records', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(await findRecordsByAircraft({ aircraftId: aircraft.id }));
});

router.get('/:id/trend', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  const records = await findRecordsByAircraft({ aircraftId: aircraft.id });
  res.json(analyzeTrend(records));
});

router.get('/:id/exceedances', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(await findExceedancesByAircraft({ aircraftId: aircraft.id }));
});

router.get('/:id/report', async (req, res) => {
  try {
    const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
    if (!aircraft) return res.status(404).json({ error: 'Not found' });
    const [records, exceedances, loadFactorDays, faultSummary] = await Promise.all([
      findRecordsByAircraft({ aircraftId: aircraft.id }),
      findExceedancesByAircraft({ aircraftId: aircraft.id }),
      findLoadFactorDaysByAircraft({ aircraftId: aircraft.id }),
      findFaultSummary({ aircraftId: aircraft.id }),
    ]);
    const filename = `${aircraft.tail_number}-trend-summary-${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    writeTrendReport(res, { aircraft, records, exceedances, loadFactorDays, faultSummary });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

router.get('/:id/load-factor', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(await findLoadFactorDaysByAircraft({ aircraftId: aircraft.id }));
});

router.get('/:id/engine-seconds', async (req, res) => {
  const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
  if (!aircraft) return res.status(404).json({ error: 'Not found' });
  res.json(await findEngineSecondsByAircraft({ aircraftId: aircraft.id }));
});

export default router;
