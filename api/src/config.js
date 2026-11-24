const {
  PORT: port = '3001',
  DB_HOST: dbHost = '127.0.0.1',
  DB_PORT: dbPort = '3306',
  DB_USER: dbUser = 'root',
  DB_PASSWORD: dbPassword = '',
  DB_NAME: dbName = 'eztrendanalysis',
  JWT_SECRET: jwtSecret,
  MAILGUN_API_KEY: mailgunApiKey,
  MAILGUN_DOMAIN: mailgunDomain,
  MAILGUN_FROM: mailgunFrom = 'noreply@eztrendanalysis.com',
  MAILGUN_WEBHOOK_SIGNING_KEY: mailgunWebhookSigningKey,
  MAILGUN_INBOUND_DOMAIN: mailgunInboundDomain,
  MAILGUN_INBOUND_PREFIX: mailgunInboundPrefix = 'trends',
  ADMIN_EMAIL: adminEmail = 'adam@pilotica.com',
  APP_URL: appUrl = 'http://localhost:5173',
} = process.env;

if (!jwtSecret) throw new Error('JWT_SECRET is required');
if (!mailgunApiKey) console.warn('MAILGUN_API_KEY not set — email features disabled');

export const config = {
  port: Number(port),
  db: { host: dbHost, port: Number(dbPort), user: dbUser, password: dbPassword, database: dbName },
  jwt: { secret: jwtSecret, expiresIn: '7d' },
  mailgun: {
    apiKey: mailgunApiKey, domain: mailgunDomain, from: mailgunFrom,
    webhookSigningKey: mailgunWebhookSigningKey,
    inboundDomain: mailgunInboundDomain || mailgunDomain,
    inboundPrefix: mailgunInboundPrefix,
  },
  adminEmail,
  appUrl,
};
