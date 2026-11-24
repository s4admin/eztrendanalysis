import { query, queryOne, getPool } from './db.js';

export const findUploadsByAircraft = ({ aircraftId }) =>
  query('SELECT * FROM uploads WHERE aircraft_id = ? ORDER BY uploaded_at DESC', [aircraftId]);

export const findUploadById = ({ id }) =>
  queryOne('SELECT * FROM uploads WHERE id = ?', [id]);

export async function deleteUpload({ id }) {
  const pool = getPool();
  // Child tables have ON DELETE CASCADE so deleting the upload removes everything
  await pool.query('DELETE FROM uploads WHERE id = ?', [id]);
}

export async function insertUpload({ aircraftId, userId, filename, recordCount, engineSecondsCount, navSecondsCount, engineId }) {
  const [r] = await getPool().query(
    'INSERT INTO uploads (aircraft_id, user_id, filename, record_count, engine_seconds_count, nav_seconds_count, engine_id) VALUES (?,?,?,?,?,?,?)',
    [aircraftId, userId, filename, recordCount, engineSecondsCount || 0, navSecondsCount || 0, engineId || null]
  );
  return r.insertId;
}

export const findRecordsByAircraft = ({ aircraftId, limit = 500 }) =>
  query('SELECT * FROM cruise_records WHERE aircraft_id = ? ORDER BY flight_date ASC, flight_time ASC LIMIT ?', [aircraftId, limit]);

export const findRecordsByUpload = ({ uploadId }) =>
  query('SELECT * FROM cruise_records WHERE upload_id = ? ORDER BY flight_date ASC', [uploadId]);

export async function insertCruiseRecords(records) {
  if (!records.length) return;
  const pool = getPool();
  const placeholders = records.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
  const values = records.flatMap(r => [
    r.uploadId, r.aircraftId, r.flightDate, r.flightTime,
    r.altitude, r.oat, r.tas, r.torque, r.np, r.ng, r.itt, r.fuelFlow,
    r.correctedItt, r.correctedFf
  ]);
  await pool.query(
    `INSERT INTO cruise_records (upload_id,aircraft_id,flight_date,flight_time,altitude,oat,tas,torque,np,ng,itt,fuel_flow,corrected_itt,corrected_ff) VALUES ${placeholders}`,
    values
  );
}

export async function insertEngineSeconds(records) {
  if (!records.length) return;
  const pool = getPool();
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = chunk.flatMap(r => [
      r.uploadId, r.aircraftId, r.flightDate, r.flightTime,
      r.tas, r.tat, r.altitude, r.ias, r.fuelFlow, r.itt, r.torque, r.ng
    ]);
    await pool.query(
      `INSERT INTO engine_seconds (upload_id,aircraft_id,flight_date,flight_time,tas,tat,altitude,ias,fuel_flow,itt,torque,ng) VALUES ${placeholders}`,
      values
    );
  }
}

export async function insertNavSeconds(records) {
  if (!records.length) return;
  const pool = getPool();
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = chunk.flatMap(r => [
      r.uploadId, r.aircraftId, r.flightDate, r.flightTime,
      r.ias, r.tas, r.mach, r.oat, r.tat, r.track, r.lat, r.lon, r.altitude
    ]);
    await pool.query(
      `INSERT INTO nav_seconds (upload_id,aircraft_id,flight_date,flight_time,ias,tas,mach,oat,tat,track,lat,lon,altitude) VALUES ${placeholders}`,
      values
    );
  }
}

export async function insertExceedances(records) {
  if (!records.length) return;
  const pool = getPool();
  const placeholders = records.map(() => '(?,?,?,?,?,?,?,?)').join(',');
  const values = records.flatMap(r => [
    r.uploadId, r.aircraftId, r.flightDate, r.flightTime,
    r.parameter, r.value, r.limitValue, r.duration || 0
  ]);
  await pool.query(
    `INSERT INTO exceedances (upload_id,aircraft_id,flight_date,flight_time,parameter,value,limit_value,duration_seconds) VALUES ${placeholders}`,
    values
  );
}

// Downsampled engine seconds for charts (every 30th record = ~30s resolution)
export const findEngineSecondsByUpload = ({ uploadId, sample = 30 }) =>
  query(`SELECT * FROM engine_seconds WHERE upload_id = ? AND (id % ?) = 0 ORDER BY flight_date, flight_time`, [uploadId, sample]);

export const findEngineSecondsByAircraft = ({ aircraftId, sample = 60 }) =>
  query(`SELECT * FROM engine_seconds WHERE aircraft_id = ? AND is_flight = 1 AND (id % ?) = 0 ORDER BY flight_date, flight_time LIMIT 2000`, [aircraftId, sample]);

export const findNavSecondsByUpload = ({ uploadId, sample = 10 }) =>
  query(`SELECT flight_date, flight_time, lat, lon, altitude, tas, ias, oat FROM nav_seconds WHERE upload_id = ? AND lat IS NOT NULL AND (id % ?) = 0 ORDER BY flight_date, flight_time`, [uploadId, sample]);

export const findExceedancesByAircraft = ({ aircraftId }) =>
  query('SELECT * FROM exceedances WHERE aircraft_id = ? ORDER BY flight_date DESC, flight_time DESC', [aircraftId]);

export const findExceedancesByUpload = ({ uploadId }) =>
  query('SELECT * FROM exceedances WHERE upload_id = ? ORDER BY flight_date, flight_time', [uploadId]);

export async function insertLoadFactorDays(records) {
  if (!records.length) return;
  await getPool().query(
    'INSERT INTO load_factor_days (upload_id,aircraft_id,flight_date,peak_g,peak_time,low_g,low_time,samples) VALUES ?',
    [records.map(r => [r.uploadId, r.aircraftId, r.flightDate, r.peakG, r.peakTime, r.lowG, r.lowTime, r.samples])]
  );
}

// One row per day: the highest peak and lowest low across all uploads covering that day
export const findLoadFactorDaysByAircraft = ({ aircraftId }) =>
  query(
    `SELECT DATE_FORMAT(d.flight_date, '%Y-%m-%d') AS flight_date,
       (SELECT peak_g FROM load_factor_days p WHERE p.aircraft_id = d.aircraft_id AND p.flight_date = d.flight_date ORDER BY peak_g DESC LIMIT 1) AS peak_g,
       (SELECT peak_time FROM load_factor_days p WHERE p.aircraft_id = d.aircraft_id AND p.flight_date = d.flight_date ORDER BY peak_g DESC LIMIT 1) AS peak_time,
       (SELECT low_g FROM load_factor_days l WHERE l.aircraft_id = d.aircraft_id AND l.flight_date = d.flight_date ORDER BY low_g ASC LIMIT 1) AS low_g,
       (SELECT low_time FROM load_factor_days l WHERE l.aircraft_id = d.aircraft_id AND l.flight_date = d.flight_date ORDER BY low_g ASC LIMIT 1) AS low_time
     FROM (SELECT DISTINCT aircraft_id, flight_date FROM load_factor_days WHERE aircraft_id = ?) d
     ORDER BY d.flight_date DESC`,
    [aircraftId]
  );
