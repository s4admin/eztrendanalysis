// Older imports read pitch attitude (aircraft log column 6) as g-force, so their
// "G-Force" exceedances are false. Remove the ones created before load factor
// tracking existed — i.e. uploads with no load_factor_days rows. Re-upload the
// acms_aircraft_data_log_file.txt afterwards to get load factor data for those days.
//
//   node --env-file=.env src/scripts/remove-pitch-gforce-events.js --dry-run
//   node --env-file=.env src/scripts/remove-pitch-gforce-events.js
import { query } from '../data/db.js';

const dryRun = process.argv.includes('--dry-run');
const where = `parameter = 'G-Force'
  AND upload_id NOT IN (SELECT DISTINCT upload_id FROM load_factor_days)`;

const [{ count }] = await query(`SELECT COUNT(*) AS count FROM exceedances WHERE ${where}`);
const byAircraft = await query(
  `SELECT a.tail_number, COUNT(*) AS n FROM exceedances e JOIN aircraft a ON a.id = e.aircraft_id
   WHERE ${where.replace(/parameter/g, 'e.parameter').replace(/upload_id NOT/g, 'e.upload_id NOT')} GROUP BY a.tail_number`
);
for (const r of byAircraft) console.log(`  ${r.tail_number}: ${r.n} false G-Force events`);
if (!dryRun && count) await query(`DELETE FROM exceedances WHERE ${where}`);
console.log(`${dryRun ? '[dry run] would remove' : 'Removed'} ${count} G-Force events`);
process.exit(0);
