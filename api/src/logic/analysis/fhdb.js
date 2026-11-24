// Parse .fhd files from the PC-12 NG Fault History Database (FHDB)

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
}

// Each .fhd line: optional binary prefix byte, then tab-delimited fields.
// After stripping the prefix and splitting on \t, cols[0] is always '' (the
// tab immediately follows the stripped byte). Real data starts at cols[1].
function parseLines(content) {
  return content.split('\r\n').map(line => {
    const buf = Buffer.from(line, 'binary');
    if (!buf.length) return null;
    const start = buf[0] > 127 ? 1 : 0;
    const cols = buf.slice(start).toString('utf8').split('\t').map(s => s.trim());
    // cols[0] is '' (empty before first real tab) — skip it, return cols[1..n]
    return cols.slice(1);
  }).filter(cols => cols !== null && cols.length >= 2);
}

export function parseFlightLegs(content) {
  // cols after slice: [leg_number, leg_sequence, datetime]
  return parseLines(content).map(cols => {
    const legNumber = parseInt(cols[0], 10);
    const legSequence = parseInt(cols[1], 10);
    const legDatetime = parseDate(cols[2]);
    if (isNaN(legNumber) || !legDatetime) return null;
    return { legNumber, legSequence: isNaN(legSequence) ? null : legSequence, legDatetime };
  }).filter(Boolean);
}

export function parseFaultHistory(content) {
  // cols: [system_id, fault_code, state, datetime, flight_leg, phase]
  return parseLines(content).map(cols => {
    const systemId = parseInt(cols[0], 10);
    const faultCode = parseInt(cols[1], 10);
    const state = parseInt(cols[2], 10);
    const eventDatetime = parseDate(cols[3]);
    const flightLeg = parseInt(cols[4], 10);
    const phase = parseInt(cols[5], 10);
    if (isNaN(systemId) || isNaN(faultCode) || !eventDatetime) return null;
    return {
      systemId,
      faultCode,
      state: state === 1 ? 1 : 0,
      eventDatetime,
      flightLeg: isNaN(flightLeg) ? null : flightLeg,
      phase: isNaN(phase) ? null : phase,
    };
  }).filter(Boolean);
}

export function parseFdeCorrelations(content) {
  // cols: [fde_id, subsystem_id, val1, val2, val3, datetime, flight_leg, phase]
  return parseLines(content).map(cols => {
    const fdeId = parseInt(cols[0], 10);
    const subsystemId = parseInt(cols[1], 10);
    const eventDatetime = parseDate(cols[5]);
    const flightLeg = parseInt(cols[6], 10);
    const phase = parseInt(cols[7], 10);
    if (isNaN(fdeId) || !eventDatetime) return null;
    return {
      fdeId,
      subsystemId: isNaN(subsystemId) ? null : subsystemId,
      eventDatetime,
      flightLeg: isNaN(flightLeg) ? null : flightLeg,
      phase: isNaN(phase) ? null : phase,
    };
  }).filter(Boolean);
}

// Parse an FHDB ZIP buffer — detects files by name
import unzipper from 'unzipper';
export async function parseFhdbZip(buffer) {
  const dir = await unzipper.Open.buffer(buffer);
  const result = { legs: [], faults: [], fde: [], downloadId: '' };
  for (const entry of dir.files) {
    if (entry.path.endsWith('/') || entry.type === 'Directory') continue;
    // Skip Mac metadata files (__MACOSX/ and ._* files)
    if (entry.path.includes('__MACOSX') || entry.path.split('/').pop().startsWith('._')) continue;
    let content;
    try { content = (await entry.buffer()).toString('binary'); } catch { continue; }
    const name = entry.path.toLowerCase();
    if (name.includes('flightlegs')) {
      result.legs = parseFlightLegs(content);
    } else if (name.includes('faulthistory')) {
      result.faults = parseFaultHistory(content);
    } else if (name.includes('fpfde') || name.includes('fde')) {
      result.fde = parseFdeCorrelations(content);
    } else if (name.includes('laststored')) {
      result.downloadId = (await entry.buffer()).toString('utf8').trim();
    }
  }
  return result;
}
