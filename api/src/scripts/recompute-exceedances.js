// Re-run engine exceedance detection (ITT, Ng, Torque) over stored engine data, after
// the limits in logic/analysis/index.js change. G-Force events come from the aircraft
// log rather than engine data, so they are left untouched.
//
//   node --env-file=.env src/scripts/recompute-exceedances.js --dry-run
//   node --env-file=.env src/scripts/recompute-exceedances.js
import { getPool, query } from '../data/db.js';
import { detectExceedances } from '../logic/analysis/index.js';

const dryRun = process.argv.includes('--dry-run');
const ENGINE_PARAMS = ['ITT Starting', 'ITT Transient', 'ITT Takeoff', 'ITT Continuous', 'Ng', 'Torque'];

const uploads = await query('SELECT DISTINCT upload_id, aircraft_id FROM engine_seconds ORDER BY upload_id');
let before = 0, after = 0;

for (const { upload_id: uploadId, aircraft_id: aircraftId } of uploads) {
  const rows = await query(
    `SELECT DATE_FORMAT(flight_date, '%Y-%m-%d') AS flightDate, TIME_FORMAT(flight_time, '%H:%i:%s') AS flightTime,
            itt, ng, torque, is_flight AS isFlight
     FROM engine_seconds WHERE upload_id = ? ORDER BY flight_date, flight_time, id`,
    [uploadId]
  );
  const existing = await query(
    `SELECT parameter, value, flight_date, flight_time, duration_seconds FROM exceedances
     WHERE upload_id = ? AND parameter IN (?)`,
    [uploadId, ENGINE_PARAMS]
  );
  const recomputed = detectExceedances(rows);
  before += existing.length;
  after += recomputed.length;
  if (existing.length === recomputed.length && !recomputed.length) continue;

  console.log(`upload ${uploadId}: ${existing.length} → ${recomputed.length} engine exceedances`);
  for (const e of recomputed) {
    console.log(`  ${e.parameter} ${e.value} (limit ${e.limitValue}) ${e.flightDate} ${e.flightTime} for ${e.duration}s`);
  }
  if (dryRun) continue;

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM exceedances WHERE upload_id = ? AND parameter IN (?)', [uploadId, ENGINE_PARAMS]);
    if (recomputed.length) {
      await conn.query(
        'INSERT INTO exceedances (upload_id,aircraft_id,flight_date,flight_time,parameter,value,limit_value,duration_seconds) VALUES ?',
        [recomputed.map(e => [uploadId, aircraftId, e.flightDate, e.flightTime, e.parameter, e.value, e.limitValue, e.duration || 0])]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

console.log(`${dryRun ? '[dry run] ' : ''}${uploads.length} uploads checked: ${before} → ${after} engine exceedances`);
process.exit(0);
