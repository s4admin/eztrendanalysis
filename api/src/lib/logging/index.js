import pino from 'pino';
const isDev = process.env.NODE_ENV !== 'production';
const logger = pino(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {});
export const createLogger = (name) => logger.child({ name });
export const handleError = (err, ctx = {}) => logger.error({ err, ...ctx });
