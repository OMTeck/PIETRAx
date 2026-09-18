import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';

export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  redact: {
    // Never write secrets to logs.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      '*.password',
      '*.token',
      '*.secret',
      '*.recoveryCodes',
    ],
    censor: '[REDACTED]',
  },
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: config.isProduction,
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});