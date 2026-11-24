import { getPool } from './data/db.js';
import { createLogger } from './lib/logging/index.js';
const logger = createLogger('migrate');

const migrations = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    encrypted_password VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS aircraft (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tail_number VARCHAR(20) NOT NULL,
    make_model VARCHAR(255),
    engine_type VARCHAR(255),
    engine_serial VARCHAR(255),
    year INT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_id INT NOT NULL,
    user_id INT NOT NULL,
    filename VARCHAR(500) NOT NULL,
    record_count INT DEFAULT 0,
    engine_seconds_count INT DEFAULT 0,
    nav_seconds_count INT DEFAULT 0,
    engine_id VARCHAR(100),
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS cruise_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    flight_date DATE NOT NULL,
    flight_time TIME,
    altitude INT,
    oat DECIMAL(6,2),
    tas DECIMAL(8,4),
    torque DECIMAL(6,2),
    np INT,
    ng DECIMAL(6,2),
    itt INT,
    fuel_flow INT,
    corrected_itt DECIMAL(8,4),
    corrected_ff DECIMAL(8,4),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS engine_seconds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    flight_date DATE,
    flight_time TIME,
    tas DECIMAL(8,2),
    tat DECIMAL(6,2),
    altitude INT,
    ias INT,
    fuel_flow INT,
    itt INT,
    torque DECIMAL(5,1),
    ng DECIMAL(5,1),
    np INT,
    is_flight TINYINT(1) DEFAULT 0,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_upload (upload_id),
    INDEX idx_aircraft_date (aircraft_id, flight_date)
  )`,
  `CREATE TABLE IF NOT EXISTS nav_seconds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    flight_date DATE,
    flight_time TIME,
    ias DECIMAL(8,2),
    tas DECIMAL(8,2),
    mach DECIMAL(6,4),
    oat DECIMAL(6,2),
    tat DECIMAL(6,2),
    track DECIMAL(7,2),
    lat DECIMAL(13,7),
    lon DECIMAL(13,7),
    altitude INT,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_upload (upload_id),
    INDEX idx_aircraft_date (aircraft_id, flight_date)
  )`,
  `CREATE TABLE IF NOT EXISTS exceedances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    flight_date DATE,
    flight_time TIME,
    parameter VARCHAR(50) NOT NULL,
    value DECIMAL(10,3) NOT NULL,
    limit_value DECIMAL(10,3) NOT NULL,
    duration_seconds INT DEFAULT 0,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS flight_legs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    leg_number INT NOT NULL,
    leg_sequence INT,
    leg_datetime DATETIME,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_upload (upload_id),
    INDEX idx_aircraft_leg (aircraft_id, leg_number)
  )`,
  `CREATE TABLE IF NOT EXISTS fault_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    system_id INT,
    fault_code INT,
    state TINYINT(1) DEFAULT 0,
    event_datetime DATETIME,
    flight_leg INT,
    phase INT,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_upload (upload_id),
    INDEX idx_fault (aircraft_id, system_id, fault_code)
  )`,
  `CREATE TABLE IF NOT EXISTS fde_correlations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    aircraft_id INT NOT NULL,
    fde_id INT,
    subsystem_id INT,
    event_datetime DATETIME,
    flight_leg INT,
    phase INT,
    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_upload (upload_id)
  )`,
  `CREATE TABLE IF NOT EXISTS detected_flights (
    id INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_id INT NOT NULL,
    flight_date DATE,
    depart_time TIME,
    arrive_time TIME,
    duration_minutes INT,
    max_altitude INT,
    avg_altitude INT,
    fuel_used_lbs DECIMAL(8,1),
    avg_fuel_flow_lbs_hr DECIMAL(7,1),
    max_itt INT,
    avg_itt INT,
    max_tas DECIMAL(7,1),
    avg_tas DECIMAL(7,1),
    distance_nm DECIMAL(8,1),
    depart_lat DECIMAL(10,7),
    depart_lon DECIMAL(10,7),
    arrive_lat DECIMAL(10,7),
    arrive_lon DECIMAL(10,7),
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    INDEX idx_aircraft_date (aircraft_id, flight_date)
  )`,
  `CREATE TABLE IF NOT EXISTS fault_code_descriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_id INT NOT NULL,
    fault_code INT NOT NULL,
    system_name VARCHAR(100),
    description VARCHAR(500),
    UNIQUE KEY uk_system_fault (system_id, fault_code)
  )`
];

const alterations = [
  `ALTER TABLE uploads ADD COLUMN engine_seconds_count INT DEFAULT 0`,
  `ALTER TABLE uploads ADD COLUMN nav_seconds_count INT DEFAULT 0`,
  `ALTER TABLE uploads ADD COLUMN fhdb_legs_count INT DEFAULT 0`,
  `ALTER TABLE uploads ADD COLUMN fhdb_faults_count INT DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(128)`,
  `ALTER TABLE users ADD COLUMN reset_password_sent_at DATETIME`,
  `ALTER TABLE users ADD COLUMN inbound_token VARCHAR(64) UNIQUE`,
];

// Comprehensive Honeywell Primus Apex CMC fault code reference
// Source: Gemini translation of FLMM + ATA 100 chapter mapping
const FAULT_DESCRIPTIONS = [
  [0,  0,    'System Log',          'Baseline system log heartbeat — operational check OK, not a functional failure'],
  [1,  585,  'Power Generation',    'Main/Emergency Bus Tie Relay dropout transient (ATA 24)'],
  [7,  16,   'Engine Instruments',  'EIU Data Concentrator Module cross-channel lag (ATA 77)'],
  [9,  14,   'GPS',                 'GPS 1 loss of satellite tracking or sync timeout (ATA 34)'],
  [9,  16,   'GPS',                 'GPS 2 loss of satellite tracking or sync timeout (ATA 34)'],
  [9,  21,   'Weather Radar',       'Weather radar (WXR) transceiver power-up fail (ATA 34)'],
  [10, 55,   'ADAHRS',              'Pitot-Static heat cycle circuit current spike (ATA 34)'],
  [10, 877,  'ADAHRS',              'ADAHRS module pitch/roll alignment interruption (ATA 34)'],
  [11, 259,  'FMS',                 'FMS cross-talk scratchpad data sync lag (ATA 34)'],
  [11, 950,  'FMS',                 'Navigation database cycle integrity/expiration warning (ATA 34)'],
  [14, 2003, 'CMC/MAU',             'Configuration File (CMF) CRC checksum delay during power-up'],
  [14, 2004, 'CMC/MAU',             'Configuration File (CMF) CRC checksum delay during power-up'],
  [14, 2006, 'CMC/MAU',             'Custom Options File (COF) initialization delay'],
  [14, 2012, 'CMC/MAU',             'Inter-Module Communication (IMC) handshake loss'],
  [14, 2013, 'CMC/MAU',             'Inter-Module Communication (IMC) handshake loss'],
  [14, 2017, 'CMC/MAU',             'Core OS task scheduler overrun'],
  [14, 2020, 'CMC/MAU',             'Display Unit (DU) time sync variance'],
  [14, 2024, 'CMC/MAU',             'Display Unit (DU) time sync variance'],
  [14, 2059, 'CMC/MAU',             'Fault history RAM buffer wrap-around/purge warning'],
  [14, 2060, 'CMC/MAU',             'Fault history RAM buffer wrap-around/purge warning'],
  [14, 2094, 'CMC/MAU',             'ASCB data bus transmission frame collision/drop'],
  [14, 2103, 'CMC/MAU',             'ASCB data bus transmission frame collision/drop'],
  [14, 2116, 'CMC/MAU',             'MAU power backplane supply voltage sag — Slot 1'],
  [14, 2118, 'CMC/MAU',             'MAU power backplane supply voltage sag — Slot 2'],
  [14, 2161, 'CMC/MAU',             'Network Interface Card (NIC) Ethernet packet mismatch'],
  [14, 2163, 'CMC/MAU',             'Network Interface Card (NIC) Ethernet packet mismatch'],
  [19, 51,   'Landing Gear',        'Gear Electronic Control Module proximity target lag (ATA 32)'],
  [20, 57,   'Engine Monitoring',   'EIU to FADEC digital data bus noise threshold breach (ATA 72)'],
  [24, 163,  'DC Electrical',       'Generator 2 Field Control Unit voltage spike (ATA 24)'],
  [25, 66,   'Cabin Systems',       'Cabin utility power load-shed controller trip (ATA 25)'],
  [25, 77,   'Cabin Systems',       'Utility component breaker software reset (ATA 25)'],
  [26, 154,  'Fire Protection',     'Fire detection loop insulation resistance out-of-limits (ATA 26)'],
  [27, 45,   'Flight Controls',     'Flap Electronic Control Unit (FECU) flap asymmetry delta (ATA 27)'],
  [28, 9,    'Fuel Management',     'FQGS tank probe capacitance reading drift (ATA 28)'],
  [28, 10,   'Fuel Management',     'FQGS tank probe capacitance reading drift (ATA 28)'],
  [28, 12,   'Fuel Management',     'Left/Right tank collector sensor signal variance (ATA 28)'],
  [28, 13,   'Fuel Management',     'Left/Right tank collector sensor signal variance (ATA 28)'],
  [29, 101,  'Hydraulic',           'Hydraulic pump motor over-current warning (ATA 29)'],
  [29, 102,  'Hydraulic',           'Hydraulic system reservoir low fluid sensor switch state (ATA 29)'],
  [30, 10,   'Ice Protection',      'Windshield anti-ice heating element open circuit (ATA 30)'],
  [30, 15,   'Ice Protection',      'Engine inlet lip bleed air anti-ice valve mismatch (ATA 30)'],
  [31, 201,  'Indicating/Recording','Display Unit (DU) internal over-temperature sensor alert (ATA 31)'],
  [31, 205,  'Indicating/Recording','Flight Data Recorder (FDR) signal capture timeout (ATA 31)'],
  [32, 88,   'Landing Gear',        'Proximity sensor target alignment failure (ATA 32)'],
  [32, 92,   'Landing Gear',        'Anti-skid brake computer valve feedback loop fail (ATA 32)'],
  [33, 301,  'Lighting',            'Emergency cabin lighting battery pack capacity low (ATA 33)'],
  [35, 401,  'Oxygen',              'Flight deck oxygen cylinder line transducer low pressure (ATA 35)'],
  [36, 12,   'Pneumatic',           'Engine bleed air pressure regulation valve loop fail (ATA 36)'],
  [36, 18,   'Pneumatic',           'Pneumatic duct over-temperature manifold warning (ATA 36)'],
  [37, 3,    'De-ice',              'Structural de-ice boot pressure switch transition lag (ATA 30)'],
  [41, 1,    'Water/Waste',         'Grey water drain mast line heater open circuit (ATA 38)'],
  [41, 3,    'Water/Waste',         'Grey water drain mast line heater open circuit/drop (ATA 38)'],
  [42, 54,   'Auto-Flight',         'Flight Director calculation synchronization lag (ATA 22)'],
  [43, 18,   'Flight Guidance',     'Autopilot servo clutch mechanical ground check fail (ATA 22)'],
  [43, 21,   'Flight Guidance',     'FGC cross-talk sync timing window delay (ATA 22)'],
  [43, 59,   'Flight Guidance',     'Guidance monitoring channel internal watchdog reset (ATA 22)'],
  [44, 61,   'ECS',                 'Cabin Pressure Control System (CPCS) communication link drop (ATA 21)'],
  [44, 171,  'ECS',                 'Certified Gas Transmitter data parameters mismatch (ATA 21)'],
  [44, 172,  'ECS',                 'Certified Sensor out-of-calibration range limits (ATA 21)'],
  [44, 175,  'ECS',                 'Certified Sensor Fault Channel A — primary circuit loss (ATA 21)'],
  [44, 176,  'ECS',                 'Certified Sensor Fault Channel B — secondary loop loss (ATA 21)'],
  [44, 240,  'ECS',                 'Vapor Cycle System (VCS) cooling compressor motor inverter step controller signal loss'],
  [44, 286,  'ECS',                 'Cabin temperature distribution mixing valve actuator position mismatch feedback'],
  [44, 290,  'ECS',                 'Primary bleed air mass flow sensor balance variance between channels'],
  [44, 336,  'ECS',                 'ECS controller microcontroller digital loop internal software auto-recovery reset'],
  [44, 340,  'ECS',                 'ECS microcontroller digital watchdog hardware reset (ATA 21)'],
  // System 14 — extended MAU/CMC codes
  [14, 2002, 'CMC/MAU',             'Configuration Module File (CMF) primary configuration integrity check mismatch at startup'],
  [14, 2005, 'CMC/MAU',             'MAU Custom Options File (COF) loading/validation delay — tells avionics which optional equipment is installed on this tail number'],
  [14, 2009, 'CMC/MAU',             'Maintenance log database synchronization timeout between display units'],
  [14, 2019, 'CMC/MAU',             'Display unit memory scratchpad cache clear or initialization timeout'],
  [14, 2023, 'CMC/MAU',             'NIC internal heartbeat timing synchronization variance'],
  [14, 2026, 'CMC/MAU',             'RTOS software partition scheduler delay (momentary computing task lag)'],
  [14, 2028, 'CMC/MAU',             'RTOS software partition scheduler delay (momentary computing task lag)'],
  [14, 2030, 'CMC/MAU',             'RTOS software partition scheduler delay (momentary computing task lag)'],
  [14, 2036, 'CMC/MAU',             'RTOS software partition scheduler delay (momentary computing task lag)'],
  [14, 2040, 'CMC/MAU',             'ASCB background network traffic parity checking warning'],
  [14, 2042, 'CMC/MAU',             'ASCB background network traffic parity checking warning'],
  [14, 2048, 'CMC/MAU',             'ASCB background network traffic parity checking warning'],
  [14, 2053, 'CMC/MAU',             'NVRAM diagnostic log data sector block write retry'],
  [14, 2063, 'CMC/MAU',             'Ethernet data bus receiver buffer momentary capacity alert'],
  [14, 2064, 'CMC/MAU',             'Ethernet data bus receiver buffer momentary capacity alert'],
  [14, 2068, 'CMC/MAU',             'CMC background self-test loop lag'],
  [14, 2069, 'CMC/MAU',             'CMC background self-test loop lag'],
  [14, 2070, 'CMC/MAU',             'IMC internal processor software handshake trace error'],
  [14, 2078, 'CMC/MAU',             'IMC internal processor software handshake trace error'],
  [14, 2085, 'CMC/MAU',             'MAU cooling fan or inner cabinet thermal sensor out-of-profile data transient'],
  [14, 2086, 'CMC/MAU',             'MAU cooling fan or inner cabinet thermal sensor out-of-profile data transient'],
  // System 10 — ADAHRS extended
  [10, 864,  'ADAHRS',              'Pitot 1 heater tracking current loop imbalance (cold ground start)'],
  [10, 865,  'ADAHRS',              'Pitot 2 heater tracking current loop imbalance (cold ground start)'],
  [10, 903,  'ADAHRS',              'IMU software accelerometer self-test calibration offset'],
  [10, 905,  'ADAHRS',              'IMU software accelerometer self-test calibration offset'],
  // System 19 — Landing Gear extended
  [19, 10,   'Landing Gear',        'LGECU proximity target alignment sensor drift (ATA 32)'],
  [19, 16,   'Landing Gear',        'LGECU proximity target alignment sensor drift (ATA 32)'],
  [19, 52,   'Landing Gear',        'Nose Wheel Steering (NWS) alignment potentiometer center-line offset'],
  [19, 70,   'Landing Gear',        'Flap/gear air-ground disagreement logic timing flag — cross-reference lag during approach configuration change. High event counts are normal bus chatter.'],
  // System 32 — Brakes extended
  [32, 25,   'Landing Gear',        'Main wheel brake assembly temperature monitoring probe transient line resistance'],
  // System 37 — Pneumatics extended
  [37, 132,  'De-ice',              'De-ice boot distribution pneumatic manifold pressure sensor transition delay'],
  [37, 161,  'De-ice',              'De-ice boot distribution pneumatic manifold pressure sensor line transient'],
  // System 38 — Vacuum/Pneumatic
  [38, 15,   'Vacuum/Waste',         'Vacuum toilet system controller — transient position or pressure switch fault on waste tank venturi/vacuum generation system (ATA 38)'],
  // System 7 — Engine Instruments extended
  [7,  17,   'Engine Instruments',  'EIU torque/RPM analog-to-digital signal noise (ATA 77)'],
  // System 20 — Engine Monitoring extended
  [20, 81,   'Engine Monitoring',   'FADEC to EIU dual-channel bus timing drift or cross-talk variance (ATA 72)'],
  [20, 82,   'Engine Monitoring',   'FADEC to EIU dual-channel bus timing drift or cross-talk variance (ATA 72)'],
  // System 25 — Cabin Systems extended
  [25, 5,    'Cabin Systems',       'Cabin interior convenience bus power distribution control relay shed event'],
  // System 26 — Fire Protection extended
  [26, 245,  'Fire Protection',     'Fire bottle squib circuit continuity check current transient'],
  // System 27 — Flight Controls extended
  [27, 23,   'Flight Controls',     'Electric Pitch Trim smart actuator dual-channel synchro timing lag — command signal loop vs. mechanical surface movement (ATA 27)'],
  [27, 42,   'Flight Controls',     'Flap smart actuator dual-channel synchro timing lag — command signal loop vs. mechanical surface movement (ATA 27)'],
  // System 28 — Fuel Management extended
  [28, 7,    'Fuel Management',     'FQGS fuel probe dry-capacitance validation delay — often triggered by extreme cold-soak or condensation inside fuel tanks causing temporary probe calibration shift'],
  // System 29 — Hydraulic extended
  [29, 13,   'Hydraulic',           'Auxiliary hydraulic power pack electric pump motor starter relay state warning'],
  // System 41 — Water/Waste extended
  [41, 2,    'Water/Waste',         'Forward/Aft drain mast heating tape circuit insulation checking drop'],
  // System 43 — Flight Guidance extended
  [43, 151,  'Flight Guidance',     'Autopilot pitch axis command compliance window delay (ATA 22)'],
  // Additional codes
  [26, 149,  'Fire Protection',     'Engine fire detection loop single-channel isolation — momentary electrical impedance fault or open-circuit signature on Loop A or B. Background event (no CAS); often caused by engine wash, moisture, or thermal expansion at firewall connector plugs (ATA 26)'],
  [14, 2016, 'CMC/MAU',             'COF secondary memory allocation delay — NVRAM partition timeout during Custom Options File initialization. Classic cold-start power-up artifact on battery start; no maintenance action required unless display lockup occurs'],
];

export async function runMigrations() {
  const pool = getPool();
  for (const sql of migrations) {
    await pool.query(sql);
  }
  for (const sql of alterations) {
    try {
      await pool.query(sql);
    } catch (err) {
      // 1060 = duplicate column — already exists, safe to ignore
      if (err.errno !== 1060) throw err;
    }
  }
  // Upsert fault code descriptions — updates existing entries when reference improves
  for (const [systemId, faultCode, systemName, description] of FAULT_DESCRIPTIONS) {
    await pool.query(
      `INSERT INTO fault_code_descriptions (system_id, fault_code, system_name, description)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE system_name = VALUES(system_name), description = VALUES(description)`,
      [systemId, faultCode, systemName, description]
    );
  }
  logger.info('Migrations complete');
}
