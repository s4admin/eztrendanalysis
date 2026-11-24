import { findAircraftById, findAircraftByUser, findAircraftByUnitSerial } from '../../data/aircraft.js';
import { insertUpload } from '../../data/uploads.js';
import { getPool } from '../../data/db.js';
import { insertFlightLegs, insertFaultEvents, insertFdeCorrelations } from '../../data/faults.js';
import { parseFhdbZip } from '../analysis/fhdb.js';

const importError = (message, status = 400) => Object.assign(new Error(message), { status });

// MyCMC names downloads FHDB_PC12_LDI_10_11_04_0461097_20260204215138(.zip)
export const isFhdbFilename = (name) => /fhdb/i.test(name || '') && /\.zip$/i.test(name || '');

// 7-digit unit serial shared by a unit's ACMS_ and FHDB_ downloads
export const unitSerialFromFilename = (name) => (name || '').match(/_(\d{7})_/)?.[1] ?? null;

const normalizeTail = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// Work out which aircraft an emailed FHDB file belongs to, since the file has no tail number
export async function resolveFhdbAircraft({ userId, originalname, subject, aircraftIdFromEmail }) {
  if (aircraftIdFromEmail) return findAircraftById({ id: aircraftIdFromEmail, userId });

  const serial = unitSerialFromFilename(originalname);
  if (serial) {
    const matches = await findAircraftByUnitSerial({ userId, serial });
    if (matches.length === 1) return matches[0];
  }

  const aircraft = await findAircraftByUser({ userId });
  const subjectTokens = (subject || '').split(/\s+/).map(normalizeTail).filter(Boolean);
  const bySubject = aircraft.filter(a => subjectTokens.includes(normalizeTail(a.tail_number)));
  if (bySubject.length === 1) return bySubject[0];

  if (aircraft.length === 1) return aircraft[0];
  return null;
}

export async function importFhdbFile({ userId, buffer, originalname, aircraftId }) {
  if (!originalname.toLowerCase().endsWith('.zip')) throw importError('Upload the FHDB folder as a ZIP file');

  const { legs, faults, fde, downloadId } = await parseFhdbZip(buffer);
  if (!legs.length && !faults.length) {
    throw importError('No FHDB data found. Make sure the ZIP contains FlightLegs.fhd and FPFaultHistory.fhd');
  }

  if (!aircraftId) throw importError('Select an aircraft to associate this FHDB data with.');
  const aircraft = await findAircraftById({ id: aircraftId, userId });
  if (!aircraft) throw importError('Aircraft not found', 404);

  const uploadId = await insertUpload({
    aircraftId: aircraft.id, userId,
    filename: originalname,
    recordCount: 0,
    engineSecondsCount: 0,
    navSecondsCount: legs.length,
    engineId: unitSerialFromFilename(originalname) || ''
  });

  // Update leg/fault counts on upload record
  await getPool().query('UPDATE uploads SET fhdb_legs_count = ?, fhdb_faults_count = ? WHERE id = ?',
    [legs.length, faults.length, uploadId]);

  const aid = aircraft.id;
  await insertFlightLegs(legs.map(r => ({ ...r, uploadId, aircraftId: aid })));
  await insertFaultEvents(faults.map(r => ({ ...r, uploadId, aircraftId: aid })));
  if (fde.length) await insertFdeCorrelations(fde.map(r => ({ ...r, uploadId, aircraftId: aid })));

  return {
    uploadId, aircraftId: aircraft.id, tailNumber: aircraft.tail_number,
    legs: legs.length, faults: faults.length, fde: fde.length, downloadId
  };
}
