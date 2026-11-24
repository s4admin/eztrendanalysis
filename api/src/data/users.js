import { query, queryOne, getPool } from './db.js';

export const findUserByEmail = ({ email }) => queryOne('SELECT * FROM users WHERE email = ?', [email]);
export const findUserById = ({ id }) => queryOne('SELECT id, name, email, created_at, last_login_at FROM users WHERE id = ?', [id]);
export async function insertUser({ name, email, hash }) {
  const [result] = await getPool().query(
    'INSERT INTO users (name, email, encrypted_password) VALUES (?, ?, ?)', [name, email, hash]
  );
  return result.insertId;
}
export const updateLastLogin = ({ id }) => query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);

export const findUserByResetToken = ({ token }) =>
  queryOne('SELECT * FROM users WHERE reset_password_token = ?', [token]);

export async function setResetToken({ id, token }) {
  await getPool().query(
    'UPDATE users SET reset_password_token = ?, reset_password_sent_at = NOW() WHERE id = ?',
    [token, id]
  );
}

export async function clearResetToken({ id, passwordHash }) {
  await getPool().query(
    'UPDATE users SET encrypted_password = ?, reset_password_token = NULL, reset_password_sent_at = NULL WHERE id = ?',
    [passwordHash, id]
  );
}

export const findAllUsers = () =>
  query(`SELECT u.id, u.name, u.email, u.created_at, u.last_login_at,
    (SELECT COUNT(*) FROM detected_flights df JOIN aircraft a ON a.id = df.aircraft_id WHERE a.user_id = u.id) AS flight_count,
    (SELECT COUNT(*) FROM aircraft WHERE user_id = u.id) AS aircraft_count,
    (SELECT COUNT(*) FROM uploads WHERE user_id = u.id) AS upload_count
    FROM users u ORDER BY u.last_login_at DESC, u.created_at DESC`);

export const findUserByInboundToken = ({ token }) =>
  queryOne('SELECT id, name, email, inbound_token FROM users WHERE inbound_token = ?', [token]);

export const findInboundToken = async ({ id }) =>
  (await queryOne('SELECT inbound_token FROM users WHERE id = ?', [id]))?.inbound_token ?? null;

export async function setInboundToken({ id, token }) {
  await getPool().query('UPDATE users SET inbound_token = ? WHERE id = ?', [token, id]);
}
