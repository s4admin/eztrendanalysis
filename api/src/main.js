import express from 'express';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { createLogger, handleError } from './lib/logging/index.js';
import { runMigrations } from './migrate.js';

const logger = createLogger('main');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

registerRoutes(app);

app.use((err, req, res, next) => {
  handleError(err, { url: req.url, method: req.method });
  res.status(500).json({ error: 'Internal server error' });
});

runMigrations().then(() => {
  app.listen(config.port, () => logger.info(`EZ Trend Analysis API on port ${config.port}`));
}).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
