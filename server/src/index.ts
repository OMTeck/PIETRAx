import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { config, requireConfig } from './config.js';
import { prisma } from './db.js';
import { logger, httpLogger } from './logger.js';
import { securityHeaders, corsPolicy, staticFileHeaders } from './http/security.js';
import { sessionMiddleware } from './http/session.js';
import { loadSessionAuth, attachAuthUser } from './http/auth.js';
import { csrfProtection } from './http/csrf.js';
import { apiLimiter } from './http/rateLimit.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';

requireConfig();

const app: Express = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// Respond to /health before any session/cookie machinery.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (err) {
    logger.error(err, 'health check failed');
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use(httpLogger);
app.use(securityHeaders);
app.use(corsPolicy(config.corsOrigins));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());

app.use(sessionMiddleware);
app.use(loadSessionAuth);
app.use(attachAuthUser());

// CSRF double-submit for every mutating /api request. GET/HEAD/OPTIONS skip it.
app.use('/api', csrfProtection);
app.use('/api', apiLimiter);

// API routes.
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

// Uploaded assets (UUID filenames -> static, cacheable).
app.use('/uploads', staticFileHeaders, express.static(config.uploadDir, { fallthrough: true, index: false }));

// Production SPA serving: only when the built client exists. All unknown,
// non-API paths fall through to index.html (hash router needs no rewrites).
const clientDist = config.clientDistDir;
const clientIndex = path.join(clientDist, 'index.html');
if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(clientIndex);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function main() {
  app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.isProduction ? 'production' : 'development' }, 'PIETRAx API listening');
  });
}

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  void prisma
    .$disconnect()
    .catch((err) => logger.error(err, 'error during prisma disconnect'))
    .finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

void main();