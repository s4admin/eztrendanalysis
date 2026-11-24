import { findAircraftById, findOrCreateAircraftByTail, findAircraftByEngineSerial, updateAircraft, inferAircraftMetaFromEngineSerial } from '../../data/aircraft.js';
import { insertUpload, insertCruiseRecords, insertEngineSeconds, insertNavSeconds, insertExceedances, insertLoadFactorDays } from '../../data/uploads.js';
import { parseAcmsZip, parseAcmsTxt } from '../analysis/index.js';

const importError = (message, status = 400) => Object.assign(new Error(message), { status });

export const isTrendFilename = (name) => /\.(zip|txt)$/i.test(name || '');

export async function importTrendFile({ userId, buffer, originalname, aircraftId }) {
  const fname = originalname.toLowerCase();
  let parsed;
  if (fname.endsWith('.zip')) {
    parsed = await parseAcmsZip(buffer);
  } else if (fname.endsWith('.txt')) {
    parsed = parseAcmsTxt(buffer, originalname);
  } else {
    throw importError('Upload a .zip or .txt file');
  }

  const { cruiseRecords, engineSeconds, navSeconds, exceedances, engineId, tailNumber, filename } = parsed;
  const loadFactorDays = parsed.loadFactorDays || [];
  const totalRecords = cruiseRecords.length + engineSeconds.length + navSeconds.length + exceedances.length + loadFactorDays.length;
  if (totalRecords === 0) throw importError('No valid data found in file');

  // Resolve aircraft: use provided aircraftId, or auto-detect from file data
  let aircraft;
  if (aircraftId) {
    aircraft = await findAircraftById({ id: aircraftId, userId });
    if (!aircraft) throw importError('Aircraft not found', 404);
  } else if (tailNumber) {
    const result = await findOrCreateAircraftByTail({ userId, tailNumber, engineSerial: engineId || null });
    aircraft = result.aircraft;
  } else if (engineId) {
    aircraft = await findAircraftByEngineSerial({ userId, engineSerial: engineId });
    if (!aircraft) throw importError(`No aircraft found with engine ID ${engineId}. Upload the engine data log or navair file first so the aircraft can be created from the tail number.`);
  } else {
    throw importError('Could not determine aircraft from file. Please select an aircraft manually.');
  }

  // Backfill engine serial + inferred make/model/engine type if not set yet
  if (engineId) {
    const inferred = inferAircraftMetaFromEngineSerial(engineId);
    const updates = {};
    if (!aircraft.engine_serial) updates.engine_serial = engineId;
    if (inferred.makeModel && !aircraft.make_model) updates.make_model = inferred.makeModel;
    if (inferred.engineType && !aircraft.engine_type) updates.engine_type = inferred.engineType;
    if (Object.keys(updates).length) {
      await updateAircraft({ id: aircraft.id, userId }, updates);
    }
  }

  const uploadId = await insertUpload({
    aircraftId: aircraft.id, userId, filename,
    recordCount: cruiseRecords.length,
    engineSecondsCount: engineSeconds.length,
    navSecondsCount: navSeconds.length,
    engineId
  });

  const aid = aircraft.id;
  if (cruiseRecords.length) await insertCruiseRecords(cruiseRecords.map(r => ({ ...r, uploadId, aircraftId: aid })));
  if (engineSeconds.length) await insertEngineSeconds(engineSeconds.map(r => ({ ...r, uploadId, aircraftId: aid })));
  if (navSeconds.length) await insertNavSeconds(navSeconds.map(r => ({ ...r, uploadId, aircraftId: aid })));
  if (exceedances.length) await insertExceedances(exceedances.map(r => ({ ...r, uploadId, aircraftId: aid })));
  if (loadFactorDays.length) await insertLoadFactorDays(loadFactorDays.map(r => ({ ...r, uploadId, aircraftId: aid })));

  // Trigger flight detection after new engine data is stored
  if (engineSeconds.length) {
    import('../analysis/detect-flights.js').then(({ detectAndStoreFlights }) => {
      detectAndStoreFlights(aircraft.id).catch(err => console.warn('Flight detection failed:', err.message));
    });
  }

  return {
    uploadId,
    aircraftId: aircraft.id,
    tailNumber: aircraft.tail_number,
    cruiseRecords: cruiseRecords.length,
    engineSeconds: engineSeconds.length,
    navSeconds: navSeconds.length,
    exceedances: exceedances.length,
    filename
  };
}

// Import a batch of files the same way the dashboard does: stable_cruise last so the
// aircraft exists from the other files first, then reuse the resolved aircraft for the rest.
export async function importTrendFiles({ userId, files }) {
  const sorted = [
    ...files.filter(f => !f.originalname.toLowerCase().includes('stable_cruise')),
    ...files.filter(f => f.originalname.toLowerCase().includes('stable_cruise')),
  ];
  let aircraftId = null;
  const results = [];
  for (const file of sorted) {
    try {
      const result = await importTrendFile({ userId, buffer: file.buffer, originalname: file.originalname, aircraftId });
      if (!aircraftId) aircraftId = result.aircraftId;
      results.push({ originalname: file.originalname, ok: true, result });
    } catch (err) {
      results.push({ originalname: file.originalname, ok: false, error: err.message });
    }
  }
  return results;
}
