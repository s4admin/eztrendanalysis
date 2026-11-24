import { query } from '../../data/db.js';
import { insertFlight, deleteFlightsByAircraft } from '../../data/flights.js';

// Haversine distance in nautical miles
function distanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export async function detectAndStoreFlights(aircraftId) {
  // Get all engine_seconds for this aircraft sorted chronologically, flight phase only
  const rows = await query(
    `SELECT flight_date, flight_time, altitude, fuel_flow, itt, tas
     FROM engine_seconds
     WHERE aircraft_id = ? AND altitude > 500
     ORDER BY flight_date ASC, flight_time ASC`,
    [aircraftId]
  );

  if (!rows.length) return 0;

  // Get nav_seconds for position data
  const navRows = await query(
    `SELECT flight_date, flight_time, lat, lon, altitude, tas
     FROM nav_seconds
     WHERE aircraft_id = ? AND lat IS NOT NULL
     ORDER BY flight_date ASC, flight_time ASC`,
    [aircraftId]
  );

  // Build nav lookup by date+time
  const navMap = new Map();
  for (const n of navRows) {
    navMap.set(`${n.flight_date}|${n.flight_time}`, n);
  }

  // Segment engine_seconds into flights
  // A new flight starts when gap between consecutive records > 10 minutes
  const GAP_SECONDS = 600;
  const segments = [];
  let current = [rows[0]];

  const toSeconds = (date, time) => {
    const isoDate = new Date(date).toISOString().slice(0, 10);
    return new Date(`${isoDate}T${time}Z`).getTime() / 1000;
  };

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i-1];
    const curr = rows[i];
    const gap = toSeconds(curr.flight_date, curr.flight_time) - toSeconds(prev.flight_date, prev.flight_time);
    if (gap > GAP_SECONDS) {
      segments.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  segments.push(current);

  // Delete existing detected flights and re-insert
  await deleteFlightsByAircraft({ aircraftId });

  let count = 0;
  for (const seg of segments) {
    if (seg.length < 30) continue; // skip < 30 seconds at altitude

    const first = seg[0];
    const last = seg[seg.length - 1];

    const flightDate = new Date(first.flight_date).toISOString().slice(0, 10);
    const departTime = first.flight_time;
    const arriveTime = last.flight_time;

    const deptSec = toSeconds(first.flight_date, first.flight_time);
    const arrvSec = toSeconds(last.flight_date, last.flight_time);
    const durationMinutes = Math.round((arrvSec - deptSec) / 60);

    const altitudes = seg.map(r => r.altitude).filter(Boolean);
    const maxAltitude = Math.max(...altitudes);
    const avgAltitude = Math.round(altitudes.reduce((a,b) => a+b, 0) / altitudes.length);

    const itts = seg.map(r => r.itt).filter(v => v > 100);
    const maxItt = itts.length ? Math.max(...itts) : null;
    const avgItt = itts.length ? Math.round(itts.reduce((a,b) => a+b, 0) / itts.length) : null;

    const fuelFlows = seg.map(r => r.fuel_flow).filter(v => v > 0);
    const avgFuelFlowLbsHr = fuelFlows.length ? parseFloat((fuelFlows.reduce((a,b) => a+b, 0) / fuelFlows.length).toFixed(1)) : null;
    // fuel used = avg_flow * duration in hours
    const fuelUsedLbs = avgFuelFlowLbsHr && durationMinutes ? parseFloat((avgFuelFlowLbsHr * durationMinutes / 60).toFixed(1)) : null;

    const tasVals = seg.map(r => r.tas).filter(v => v > 50);
    const maxTas = tasVals.length ? parseFloat(Math.max(...tasVals).toFixed(1)) : null;
    const avgTas = tasVals.length ? parseFloat((tasVals.reduce((a,b) => a+b, 0) / tasVals.length).toFixed(1)) : null;

    // Get nav track for this flight segment
    const segNav = navRows.filter(n => {
      const t = toSeconds(n.flight_date, n.flight_time);
      return t >= deptSec - 120 && t <= arrvSec + 120 && n.altitude > 200;
    });

    let distanceNmVal = null;
    let departLat = null, departLon = null, arriveLat = null, arriveLon = null;
    if (segNav.length >= 2) {
      departLat = segNav[0].lat;
      departLon = segNav[0].lon;
      arriveLat = segNav[segNav.length-1].lat;
      arriveLon = segNav[segNav.length-1].lon;
      let dist = 0;
      for (let i = 1; i < segNav.length; i++) {
        dist += distanceNm(segNav[i-1].lat, segNav[i-1].lon, segNav[i].lat, segNav[i].lon);
      }
      distanceNmVal = parseFloat(dist.toFixed(1));
    }

    await insertFlight({
      aircraftId, flightDate, departTime, arriveTime, durationMinutes,
      maxAltitude, avgAltitude, fuelUsedLbs, avgFuelFlowLbsHr,
      maxItt, avgItt, maxTas, avgTas, distanceNm: distanceNmVal,
      departLat, departLon, arriveLat, arriveLon
    });
    count++;
  }

  return count;
}
