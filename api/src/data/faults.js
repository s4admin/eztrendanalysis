import { getPool, query, queryOne } from './db.js';

export async function insertFlightLegs(records) {
  if (!records.length) return;
  const pool = getPool();
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const ph = chunk.map(() => '(?,?,?,?,?)').join(',');
    const vals = chunk.flatMap(r => [r.uploadId, r.aircraftId, r.legNumber, r.legSequence, r.legDatetime]);
    await pool.query(`INSERT INTO flight_legs (upload_id,aircraft_id,leg_number,leg_sequence,leg_datetime) VALUES ${ph}`, vals);
  }
}

export async function insertFaultEvents(records) {
  if (!records.length) return;
  const pool = getPool();
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const ph = chunk.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    const vals = chunk.flatMap(r => [r.uploadId, r.aircraftId, r.systemId, r.faultCode, r.state, r.eventDatetime, r.flightLeg, r.phase]);
    await pool.query(`INSERT INTO fault_events (upload_id,aircraft_id,system_id,fault_code,state,event_datetime,flight_leg,phase) VALUES ${ph}`, vals);
  }
}

export async function insertFdeCorrelations(records) {
  if (!records.length) return;
  const pool = getPool();
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const ph = chunk.map(() => '(?,?,?,?,?,?)').join(',');
    const vals = chunk.flatMap(r => [r.uploadId, r.aircraftId, r.fdeId, r.subsystemId, r.eventDatetime, r.flightLeg]);
    await pool.query(`INSERT INTO fde_correlations (upload_id,aircraft_id,fde_id,subsystem_id,event_datetime,flight_leg) VALUES ${ph}`, vals);
  }
}

// Top fault codes by frequency
export const findFaultSummary = ({ aircraftId }) =>
  query(`
    SELECT f.system_id, f.fault_code,
           COUNT(*) AS total_events,
           SUM(f.state) AS active_events,
           MAX(f.event_datetime) AS last_seen,
           MIN(f.event_datetime) AS first_seen,
           d.system_name,
           d.description
    FROM fault_events f
    LEFT JOIN fault_code_descriptions d
      ON d.system_id = f.system_id AND d.fault_code = f.fault_code
    WHERE f.aircraft_id = ?
    GROUP BY f.system_id, f.fault_code, d.system_name, d.description
    ORDER BY total_events DESC
    LIMIT 100
  `, [aircraftId]);

// Recent active faults (last 30 days of data)
export const findRecentActiveFaults = ({ aircraftId }) =>
  query(`
    SELECT * FROM fault_events
    WHERE aircraft_id = ? AND state = 1
    ORDER BY event_datetime DESC
    LIMIT 200
  `, [aircraftId]);

export const findFlightLegsByAircraft = ({ aircraftId }) =>
  query('SELECT * FROM flight_legs WHERE aircraft_id = ? ORDER BY leg_datetime DESC LIMIT 500', [aircraftId]);

export const findFaultsByUpload = ({ uploadId }) =>
  query('SELECT * FROM fault_events WHERE upload_id = ? ORDER BY event_datetime DESC LIMIT 1000', [uploadId]);
