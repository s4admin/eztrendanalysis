import { Router } from 'express';
import { requireAuth } from '../lib/auth/index.js';
import { findAircraftById } from '../data/aircraft.js';
import { findFlightsByAircraft, findFlightById } from '../data/flights.js';
import { detectAndStoreFlights } from '../logic/analysis/detect-flights.js';
import { query } from '../data/db.js';

const router = Router();
router.use(requireAuth);

// List flights for an aircraft
router.get('/aircraft/:id/flights', async (req, res) => {
  try {
    const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
    if (!aircraft) return res.status(404).json({ error: 'Not found' });
    const flights = await findFlightsByAircraft({ aircraftId: aircraft.id });
    res.json(flights);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Re-detect flights (trigger after new upload)
router.post('/aircraft/:id/flights/detect', async (req, res) => {
  try {
    const aircraft = await findAircraftById({ id: Number(req.params.id), userId: req.user.userId });
    if (!aircraft) return res.status(404).json({ error: 'Not found' });
    const count = await detectAndStoreFlights(aircraft.id);
    res.json({ detected: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get engine data for a specific flight (for ITT chart)
router.get('/flights/:id/engine', async (req, res) => {
  try {
    const flightId = Number(req.params.id);
    // Find any aircraft this user owns that has this flight
    const flight = await query(
      `SELECT df.*, a.user_id FROM detected_flights df
       JOIN aircraft a ON a.id = df.aircraft_id
       WHERE df.id = ? AND a.user_id = ?`,
      [flightId, req.user.userId]
    );
    if (!flight[0]) return res.status(404).json({ error: 'Not found' });
    const f = flight[0];
    // Fetch engine seconds within the flight window (+/- 15 min buffer)
    const rows = await query(
      `SELECT flight_time, altitude, itt, ng, torque, fuel_flow, tas
       FROM engine_seconds
       WHERE aircraft_id = ?
         AND flight_date = ?
         AND flight_time BETWEEN SUBTIME(?, '00:15:00') AND ADDTIME(?, '00:15:00')
       ORDER BY flight_time ASC`,
      [f.aircraft_id, f.flight_date, f.depart_time, f.arrive_time]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get nav track for a specific flight
router.get('/flights/:id/track', async (req, res) => {
  try {
    const flight = await query(
      `SELECT df.*, a.user_id FROM detected_flights df
       JOIN aircraft a ON a.id = df.aircraft_id
       WHERE df.id = ? AND a.user_id = ?`,
      [Number(req.params.id), req.user.userId]
    );
    if (!flight[0]) return res.status(404).json({ error: 'Not found' });
    const f = flight[0];
    const rows = await query(
      `SELECT flight_time, lat, lon, altitude, tas
       FROM nav_seconds
       WHERE aircraft_id = ?
         AND flight_date = ?
         AND lat IS NOT NULL
         AND flight_time BETWEEN SUBTIME(?, '00:15:00') AND ADDTIME(?, '00:15:00')
       ORDER BY flight_time ASC`,
      [f.aircraft_id, f.flight_date, f.depart_time, f.arrive_time]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
