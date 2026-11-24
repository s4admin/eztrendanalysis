import { query, queryOne, getPool } from './db.js';

export const findFlightsByAircraft = ({ aircraftId, limit = 200 }) =>
  query('SELECT * FROM detected_flights WHERE aircraft_id = ? ORDER BY flight_date DESC, depart_time DESC LIMIT ?', [aircraftId, limit]);

export const findFlightById = ({ id, aircraftId }) =>
  queryOne('SELECT * FROM detected_flights WHERE id = ? AND aircraft_id = ?', [id, aircraftId]);

export async function insertFlight(f) {
  const [r] = await getPool().query(
    `INSERT INTO detected_flights
      (aircraft_id, flight_date, depart_time, arrive_time, duration_minutes,
       max_altitude, avg_altitude, fuel_used_lbs, avg_fuel_flow_lbs_hr,
       max_itt, avg_itt, max_tas, avg_tas, distance_nm,
       depart_lat, depart_lon, arrive_lat, arrive_lon)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [f.aircraftId, f.flightDate, f.departTime, f.arriveTime, f.durationMinutes,
     f.maxAltitude, f.avgAltitude, f.fuelUsedLbs, f.avgFuelFlowLbsHr,
     f.maxItt, f.avgItt, f.maxTas, f.avgTas, f.distanceNm,
     f.departLat, f.departLon, f.arriveLat, f.arriveLon]
  );
  return r.insertId;
}

export async function deleteFlightsByAircraft({ aircraftId }) {
  await getPool().query('DELETE FROM detected_flights WHERE aircraft_id = ?', [aircraftId]);
}
