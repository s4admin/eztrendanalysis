import { query, queryOne, getPool } from './db.js';

export const findAircraftByUser = ({ userId }) =>
  query('SELECT * FROM aircraft WHERE user_id = ? ORDER BY tail_number', [userId]);

export const findAircraftById = ({ id, userId }) =>
  queryOne('SELECT * FROM aircraft WHERE id = ?' + (userId ? ' AND user_id = ?' : ''), userId ? [id, userId] : [id]);

export async function insertAircraft({ userId, tailNumber, makeModel, engineType, engineSerial, year, notes }) {
  const [r] = await getPool().query(
    'INSERT INTO aircraft (user_id, tail_number, make_model, engine_type, engine_serial, year, notes) VALUES (?,?,?,?,?,?,?)',
    [userId, tailNumber, makeModel || null, engineType || null, engineSerial || null, year || null, notes || null]
  );
  return r.insertId;
}

export async function updateAircraft({ id, userId }, fields) {
  const cols = Object.keys(fields).filter(k => ['tail_number','make_model','engine_type','engine_serial','year','notes'].includes(k));
  if (!cols.length) return;
  const sets = cols.map(c => `${c} = ?`).join(', ');
  await getPool().query(`UPDATE aircraft SET ${sets} WHERE id = ? AND user_id = ?`, [...cols.map(c => fields[c]), id, userId]);
}

export async function deleteAircraft({ id, userId }) {
  await getPool().query('DELETE FROM aircraft WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function findAircraftByEngineSerial({ userId, engineSerial }) {
  return queryOne(
    'SELECT * FROM aircraft WHERE user_id = ? AND engine_serial = ?',
    [userId, engineSerial]
  );
}

// Infer aircraft make/model and engine type from the engine serial prefix
// PT6A engine IDs use a prefix that identifies the engine variant
const ENGINE_SERIAL_MAP = {
  PCE: { makeModel: 'Pilatus PC-12 NG', engineType: 'PT6A-67P' },   // PC-12 NG (PT6A-67P)
  PCE67B: { makeModel: 'Pilatus PC-12 NG', engineType: 'PT6A-67B' },
  PCB: { makeModel: 'Pilatus PC-12', engineType: 'PT6A-67B' },       // earlier PC-12
  PAC: { makeModel: 'Pilatus PC-24', engineType: 'PW535E5' },
};

export function inferAircraftMetaFromEngineSerial(engineSerial) {
  if (!engineSerial) return {};
  const upper = engineSerial.toUpperCase();
  for (const [prefix, meta] of Object.entries(ENGINE_SERIAL_MAP)) {
    if (upper.startsWith(prefix)) return meta;
  }
  return {};
}

export async function findOrCreateAircraftByTail({ userId, tailNumber, engineSerial }) {
  const existing = await queryOne(
    'SELECT * FROM aircraft WHERE user_id = ? AND tail_number = ?',
    [userId, tailNumber]
  );
  if (existing) {
    // Backfill engine serial + inferred fields if not set yet
    const inferred = inferAircraftMetaFromEngineSerial(engineSerial);
    const updates = {};
    if (engineSerial && !existing.engine_serial) updates.engine_serial = engineSerial;
    if (inferred.makeModel && !existing.make_model) updates.make_model = inferred.makeModel;
    if (inferred.engineType && !existing.engine_type) updates.engine_type = inferred.engineType;
    if (Object.keys(updates).length) {
      const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await getPool().query(`UPDATE aircraft SET ${sets} WHERE id = ?`, [...Object.values(updates), existing.id]);
    }
    return { aircraft: existing, created: false };
  }
  const inferred = inferAircraftMetaFromEngineSerial(engineSerial);
  const id = await insertAircraft({
    userId, tailNumber, engineSerial,
    makeModel: inferred.makeModel,
    engineType: inferred.engineType,
  });
  const aircraft = await findAircraftById({ id });
  return { aircraft, created: true };
}

// Aircraft whose earlier uploads came from the given CMC unit serial: ACMS uploads keep it
// in the filename (ACMS_0461097_.../file.txt), FHDB uploads in engine_id
export const findAircraftByUnitSerial = ({ userId, serial }) =>
  query(
    `SELECT DISTINCT a.* FROM aircraft a JOIN uploads u ON u.aircraft_id = a.id
     WHERE a.user_id = ? AND (u.filename LIKE ? OR u.engine_id = ?)`,
    [userId, `%\\_${serial}\\_%`, serial]
  );
