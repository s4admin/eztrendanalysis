import authRouter from './auth.js';
import aircraftRouter from './aircraft.js';
import uploadsRouter from './uploads.js';
import faultsRouter from './faults.js';
import flightlogRouter from './flightlog.js';
import adminRouter from './admin.js';
import inboundRouter from './inbound.js';

export function registerRoutes(app) {
  app.use('/api/auth', authRouter);
  app.use('/api/aircraft', aircraftRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/faults', faultsRouter);
  app.use('/api/flightlog', flightlogRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/inbound', inboundRouter);
}
