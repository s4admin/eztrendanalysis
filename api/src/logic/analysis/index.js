import unzipper from 'unzipper';

// ── Utilities ──────────────────────────────────────────────────────────────

export function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, rSquared: 0 };
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = values.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, rSquared };
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
}

function parseDate(ddmmyyyy, hhmmss) {
  if (!ddmmyyyy || ddmmyyyy.length < 8) return { flightDate: null, flightTime: null };
  const day = ddmmyyyy.slice(0, 2), mon = ddmmyyyy.slice(2, 4), yr = ddmmyyyy.slice(4, 8);
  const hh = (hhmmss || '000000').slice(0, 2);
  const mm = (hhmmss || '000000').slice(2, 4);
  const ss = (hhmmss || '000000').slice(4, 6);
  return { flightDate: yr + '-' + mon + '-' + day, flightTime: hh + ':' + mm + ':' + ss };
}

// ── Stable Cruise Parser ────────────────────────────────────────────────────
export function parseStableCruise(content) {
  const records = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.match(/^\d{8},/)) continue;
    const cols = line.split(',').map(s => s.trim());
    if (cols.length < 12) continue;
    if (cols.some(c => c === 'XXX')) continue;
    const { flightDate, flightTime } = parseDate(cols[0], cols[1]);
    const engineId = cols[2] || '';
    const altitude = parseFloat(cols[3]);
    const oat = parseFloat(cols[4]);
    const tas = parseFloat(cols[5]);
    const torque = parseFloat(cols[6]);
    const np = parseFloat(cols[7]);
    const ng = parseFloat(cols[8]);
    const itt = parseFloat(cols[9]);
    const fuelFlow = parseFloat(cols[10]);
    if ([altitude, oat, tas, torque, np, ng, itt, fuelFlow].some(isNaN)) continue;
    const theta = (oat + 273.15) / 288.15;
    records.push({
      flightDate, flightTime, engineId, altitude, oat, tas, torque, np, ng, itt,
      fuelFlow,
      correctedItt: parseFloat((itt / Math.sqrt(theta)).toFixed(4)),
      correctedFf: parseFloat((fuelFlow / Math.sqrt(theta)).toFixed(4))
    });
  }
  return records;
}

// ── Engine Data Log Parser ──────────────────────────────────────────────────
// Columns (0-indexed): 0=date 1=time 2=hrs 3=tail 4=pad 5=engineId
// 6=TAS 7=TAT 8=altitude(ft) 9=IAS 10=? 11=fuelFlow 12=ITT 13=torque 14=Ng 15=Np
export function parseEngineDataLog(content) {
  const records = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.match(/^\d{8},/)) continue;
    const cols = line.split(',').map(s => s.trim());
    if (cols.length < 16) continue;
    // Skip rows where key engine cols are XXX (engine not running / invalid)
    if (cols[12] === 'XXX' || cols[14] === 'XXX' || cols[15] === 'XXX') continue;
    const { flightDate, flightTime } = parseDate(cols[0], cols[1]);
    const altitude = parseFloat(cols[8]);
    const tas = parseFloat(cols[6]);
    const tat = parseFloat(cols[7]);
    const ias = parseFloat(cols[9]);
    const fuelFlow = parseFloat(cols[11]);
    const itt = parseFloat(cols[12]);
    const torque = parseFloat(cols[13]);
    const ng = parseFloat(cols[14]);
    const np = parseFloat(cols[15]);
    // Only include records where engine parameters look valid
    if (isNaN(altitude) || isNaN(itt) || isNaN(ng) || isNaN(np)) continue;
    // Filter ground records where engine values are clearly not valid (col12 = ITT < 50 means engine off)
    if (itt < 50 && altitude < 500) continue;
    records.push({
      flightDate, flightTime,
      tas: isNaN(tas) ? null : parseFloat(tas.toFixed(1)),
      tat: isNaN(tat) ? null : parseFloat(tat.toFixed(2)),
      altitude,
      ias: isNaN(ias) || ias < 0 ? null : Math.round(ias),
      fuelFlow: isNaN(fuelFlow) ? null : Math.round(fuelFlow),
      itt: Math.round(itt),
      torque: parseFloat(torque.toFixed(1)),
      ng: parseFloat(ng.toFixed(1)),
      np: Math.round(np),
      isFlight: altitude > 1000 ? 1 : 0
    });
  }
  return records;
}

// ── Navair Data Log Parser ──────────────────────────────────────────────────
// Columns: 0=date 1=time 2=hrs 3=tail 4=pad 5=engineId
// 6=IAS 7=TAS 8=Mach 9=OAT 10=TAT 11=track 12=lat 13=lon 14=GPSalt 15=pressAlt
export function parseNavairLog(content) {
  const records = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.match(/^\d{8},/)) continue;
    const cols = line.split(',').map(s => s.trim());
    if (cols.length < 16) continue;
    // Need valid lat/lon — skip XXX rows
    if (cols[12] === 'XXX' || cols[13] === 'XXX') continue;
    const { flightDate, flightTime } = parseDate(cols[0], cols[1]);
    const ias = parseFloat(cols[6]);
    const tas = parseFloat(cols[7]);
    const mach = parseFloat(cols[8]);
    const oat = parseFloat(cols[9]);
    const tat = parseFloat(cols[10]);
    const track = parseFloat(cols[11]);
    const lat = parseFloat(cols[12]);
    const lon = parseFloat(cols[13]);
    const altitude = parseFloat(cols[15]); // pressure altitude
    if (isNaN(lat) || isNaN(lon)) continue;
    records.push({
      flightDate, flightTime,
      ias: isNaN(ias) ? null : parseFloat(ias.toFixed(1)),
      tas: isNaN(tas) ? null : parseFloat(tas.toFixed(1)),
      mach: isNaN(mach) ? null : parseFloat(mach.toFixed(4)),
      oat: isNaN(oat) ? null : parseFloat(oat.toFixed(2)),
      tat: isNaN(tat) ? null : parseFloat(tat.toFixed(2)),
      track: isNaN(track) ? null : parseFloat(track.toFixed(1)),
      lat: parseFloat(lat.toFixed(7)),
      lon: parseFloat(lon.toFixed(7)),
      altitude: isNaN(altitude) ? null : Math.round(altitude)
    });
  }
  return records;
}

// ── Aircraft Data Log Parser (load factor) ──────────────────────────────────
// No column documentation is available; meanings are inferred from the data:
//   col6 = pitch attitude (deg), col7 = bank angle (deg), col8 = heading (deg)
//   col9–11 = body rates (deg/s), col14 = longitudinal accel (tracks sin(pitch))
//   col12 = vertical inertial acceleration in g with gravity removed — ~0 on the ground
//           and in steady flight, unaffected by pitch/bank — so load factor ≈ 1 + col12
// PC-12 NG load limits: +3.4g / -1.35g
export const G_POS_LIMIT = 3.4;
export const G_NEG_LIMIT = -1.35;
const VERTICAL_ACCEL_COL = 12;

// Returns limit exceedances and, per day, the highest and lowest load factor seen
export function parseAircraftLog(content) {
  const events = [];
  const days = new Map();
  let event = null;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.match(/^\d{8},/)) continue;
    const cols = line.split(',').map(s => s.trim());
    if (cols.length < 35) continue;
    const { flightDate, flightTime } = parseDate(cols[0], cols[1]);
    const verticalAccel = parseFloat(cols[VERTICAL_ACCEL_COL]);
    if (!flightDate || isNaN(verticalAccel)) continue;
    // Reject sensor noise far outside anything the airframe could see
    if (Math.abs(verticalAccel) > 5) continue;
    const loadFactor = parseFloat((1 + verticalAccel).toFixed(3));

    const day = days.get(flightDate);
    if (!day) {
      days.set(flightDate, { flightDate, peakG: loadFactor, peakTime: flightTime, lowG: loadFactor, lowTime: flightTime, samples: 1 });
    } else {
      day.samples++;
      if (loadFactor > day.peakG) { day.peakG = loadFactor; day.peakTime = flightTime; }
      if (loadFactor < day.lowG) { day.lowG = loadFactor; day.lowTime = flightTime; }
    }

    const limit = loadFactor > G_POS_LIMIT ? G_POS_LIMIT : loadFactor < G_NEG_LIMIT ? G_NEG_LIMIT : null;
    if (limit != null) {
      if (!event || event.limitValue !== limit) {
        if (event) events.push(event);
        event = { flightDate, flightTime, value: loadFactor, limitValue: limit, duration: 1 };
      } else {
        event.duration++;
        if (Math.abs(loadFactor) > Math.abs(event.value)) event.value = loadFactor;
      }
    } else if (event) {
      events.push(event);
      event = null;
    }
  }
  if (event) events.push(event);
  return { events, loadFactorDays: [...days.values()] };
}

// ── Exceedance Detection ────────────────────────────────────────────────────
// PT6A-67P ITT tiered limits (duration in seconds before it becomes an exceedance)
const ITT_TIERS = [
  { limit: 1000, label: 'ITT Starting',   maxSeconds: 5   },
  { limit: 870,  label: 'ITT Transient',  maxSeconds: 20  },
  { limit: 850,  label: 'ITT Takeoff',    maxSeconds: 300 },
  { limit: 820,  label: 'ITT Continuous', maxSeconds: 300 }, // 820–850 permitted for up to 5 minutes
];

const SIMPLE_LIMITS = {
  ng:     { limit: 104, label: 'Ng' },
  torque: { limit: 100, label: 'Torque' },
};

export function detectExceedances(engineRecords) {
  const exceedances = [];

  // ITT — tiered, duration-aware
  // For each tier, track how long ITT stays above its threshold and record the event
  // (with its full duration) once it ends, if it lasted longer than the allowed window.
  const ittActive = {}; // keyed by tier limit
  const closeIttEvent = (tier) => {
    const event = ittActive[tier.limit];
    if (event && event.duration > tier.maxSeconds) {
      exceedances.push({ ...event, parameter: tier.label, limitValue: tier.limit });
    }
    ittActive[tier.limit] = null;
  };
  for (const r of engineRecords) {
    if (!r.isFlight) continue;
    const itt = r.itt;
    if (itt == null) continue;
    for (const tier of ITT_TIERS) {
      if (itt > tier.limit) {
        if (!ittActive[tier.limit]) {
          ittActive[tier.limit] = { flightDate: r.flightDate, flightTime: r.flightTime, value: itt, duration: 1 };
        } else {
          ittActive[tier.limit].duration++;
          if (itt > ittActive[tier.limit].value) ittActive[tier.limit].value = itt;
        }
      } else {
        closeIttEvent(tier);
      }
    }
  }
  // Close any events still open at end of data
  for (const tier of ITT_TIERS) closeIttEvent(tier);

  // Ng and Torque — simple threshold, any sustained exceedance
  const simpleActive = {};
  for (const r of engineRecords) {
    if (!r.isFlight) continue;
    for (const [param, { limit, label }] of Object.entries(SIMPLE_LIMITS)) {
      const val = r[param];
      if (val == null) continue;
      if (val > limit) {
        if (!simpleActive[param]) {
          simpleActive[param] = { flightDate: r.flightDate, flightTime: r.flightTime, value: val, duration: 1 };
        } else {
          simpleActive[param].duration++;
          if (val > simpleActive[param].value) simpleActive[param].value = val;
        }
      } else if (simpleActive[param]) {
        exceedances.push({ ...simpleActive[param], parameter: label, limitValue: limit });
        simpleActive[param] = null;
      }
    }
  }
  for (const [param, { limit, label }] of Object.entries(SIMPLE_LIMITS)) {
    if (simpleActive[param]) {
      exceedances.push({ ...simpleActive[param], parameter: label, limitValue: limit });
    }
  }

  return exceedances;
}

// ── Trend Analysis ──────────────────────────────────────────────────────────
export function analyzeTrend(records) {
  if (!records.length) return { status: 'INSUFFICIENT_DATA', parameters: {} };
  const params = {
    itt: records.map(r => parseFloat(r.itt)),
    ng: records.map(r => parseFloat(r.ng)),
    torque: records.map(r => parseFloat(r.torque)),
    fuel_flow: records.map(r => parseFloat(r.fuel_flow)),
    corrected_itt: records.map(r => parseFloat(r.corrected_itt)),
    corrected_ff: records.map(r => parseFloat(r.corrected_ff)),
  };
  const SLOPE_THRESHOLDS = { itt: 2, ng: 1.0, torque: 5, fuel_flow: 30, corrected_itt: 2, corrected_ff: 30 };
  let overallAnomaly = false;
  const analysis = {};
  for (const [key, values] of Object.entries(params)) {
    if (!values.length) continue;
    const { slope, intercept, rSquared } = linearRegression(values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = stdDev(values);
    const residuals = values.map((v, i) => v - (slope * i + intercept));
    const anomalyIndices = residuals.map((r, i) => Math.abs(r) > 2 * sd ? i : -1).filter(i => i >= 0);
    const totalChange = slope * (values.length - 1);
    const trending = Math.abs(totalChange) > (SLOPE_THRESHOLDS[key] ?? 5)
      ? (totalChange > 0 ? 'RISING' : 'DECLINING') : 'STABLE';
    const limitExceeded = key === 'itt' ? values.some(v => v > 820) : key === 'ng' ? values.some(v => v > 104) : false; // 820 = continuous cruise limit for stable snapshots
    const isAnomaly = (trending === 'RISING' && ['itt', 'corrected_itt'].includes(key)) || limitExceeded;
    if (isAnomaly) overallAnomaly = true;
    analysis[key] = { slope: parseFloat(slope.toFixed(4)), intercept: parseFloat(intercept.toFixed(4)), rSquared: parseFloat(rSquared.toFixed(4)), mean: parseFloat(mean.toFixed(2)), stdDev: parseFloat(sd.toFixed(2)), trending, anomalyIndices, limitExceeded, isAnomaly };
  }
  return { status: overallAnomaly ? 'ANOMALY' : 'NORMAL', parameters: analysis };
}

// ── ZIP / File Entry Points ─────────────────────────────────────────────────
// Extract tail number and flight hours from a data log line (engine_data, navair, aircraft_data)
// Format: date,time,flightHours,tailNumber,pad,engineId,...
function extractAircraftMeta(content) {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line.match(/^\d{8},/)) continue;
    const cols = line.split(',').map(s => s.trim());
    if (cols.length < 4) continue;
    const tailNumber = cols[3];
    const flightHours = parseInt(cols[2], 10);
    // Tail numbers are N-numbers or similar registration marks
    if (tailNumber && /^[A-Z0-9-]{2,10}$/.test(tailNumber)) {
      return { tailNumber, flightHours: isNaN(flightHours) ? null : flightHours };
    }
  }
  return { tailNumber: null, flightHours: null };
}

export async function parseAcmsZip(buffer) {
  const dir = await unzipper.Open.buffer(buffer);
  const result = { cruiseRecords: [], engineSeconds: [], navSeconds: [], exceedances: [], engineId: '', tailNumber: null, flightHours: null, filename: '' };
  const gForceEvents = [];
  const loadFactorDays = [];
  for (const entry of dir.files) {
    if (entry.path.endsWith('/') || entry.type === 'Directory') continue;
    // Skip macOS resource-fork metadata (__MACOSX/._file) that would overwrite the real files
    if (entry.path.startsWith('__MACOSX/') || entry.path.split('/').pop().startsWith('._')) continue;
    let content;
    try {
      content = (await entry.buffer()).toString('utf8');
    } catch {
      continue;
    }
    const name = entry.path.toLowerCase();
    if (name.includes('stable_cruise')) {
      result.cruiseRecords = parseStableCruise(content);
      result.engineId = result.cruiseRecords[0]?.engineId || '';
      result.filename = entry.path;
    } else if (name.includes('engine_data')) {
      result.engineSeconds = parseEngineDataLog(content);
      if (!result.tailNumber) {
        const meta = extractAircraftMeta(content);
        result.tailNumber = meta.tailNumber;
        result.flightHours = meta.flightHours;
      }
    } else if (name.includes('navair')) {
      result.navSeconds = parseNavairLog(content);
      if (!result.tailNumber) {
        const meta = extractAircraftMeta(content);
        result.tailNumber = meta.tailNumber;
        result.flightHours = meta.flightHours;
      }
    } else if (name.includes('aircraft_data')) {
      const { events, loadFactorDays: days } = parseAircraftLog(content);
      gForceEvents.push(...events);
      loadFactorDays.push(...days);
      if (!result.tailNumber) {
        const meta = extractAircraftMeta(content);
        result.tailNumber = meta.tailNumber;
        result.flightHours = meta.flightHours;
      }
    }
  }
  result.exceedances = [
    ...detectExceedances(result.engineSeconds),
    ...gForceEvents.map(e => ({ ...e, parameter: 'G-Force' })),
  ];
  result.loadFactorDays = loadFactorDays;
  if (!result.filename) result.filename = 'acms_upload.zip';
  return result;
}

export function parseAcmsTxt(buffer, filename) {
  const content = buffer.toString('utf8');
  const fname = filename.toLowerCase();
  const base = { tailNumber: null, flightHours: null };
  if (fname.includes('stable_cruise')) {
    const records = parseStableCruise(content);
    return { ...base, cruiseRecords: records, engineSeconds: [], navSeconds: [], exceedances: [], engineId: records[0]?.engineId || '', filename };
  }
  if (fname.includes('engine_data')) {
    const engineSeconds = parseEngineDataLog(content);
    const meta = extractAircraftMeta(content);
    return { ...meta, cruiseRecords: [], engineSeconds, navSeconds: [], exceedances: detectExceedances(engineSeconds), engineId: '', filename };
  }
  if (fname.includes('navair')) {
    const meta = extractAircraftMeta(content);
    return { ...meta, cruiseRecords: [], engineSeconds: [], navSeconds: parseNavairLog(content), exceedances: [], engineId: '', filename };
  }
  if (fname.includes('aircraft_data')) {
    const meta = extractAircraftMeta(content);
    const { events, loadFactorDays } = parseAircraftLog(content);
    const exceedances = events.map(e => ({ ...e, parameter: 'G-Force' }));
    return { ...meta, cruiseRecords: [], engineSeconds: [], navSeconds: [], exceedances, loadFactorDays, engineId: '', filename };
  }
  // Unknown format — try stable cruise as fallback
  const records = parseStableCruise(content);
  return { ...base, cruiseRecords: records, engineSeconds: [], navSeconds: [], exceedances: [], engineId: records[0]?.engineId || '', filename };
}
