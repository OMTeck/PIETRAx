import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(SERVER_DIR, '..');

dotenv.config({ path: path.join(SERVER_DIR, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

function envStr(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

function envInt(key: string, fallback: number): number {
  const value = Number.parseInt(envStr(key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envBool(key: string, fallback = false): boolean {
  const value = envStr(key).toLowerCase();
  if (value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export const config = {
  isProduction: envStr('APP_ENV', 'development') === 'production',
  port: envInt('PORT', 4000),
  databaseUrl: envStr('DATABASE_URL'),
  sessionSecret: envStr('SESSION_SECRET'),
  csrfSecret: envStr('CSRF_SECRET') || envStr('SESSION_SECRET'),
  sessionIdleMinutes: envInt('SESSION_IDLE_TTL_MINUTES', 60),
  sessionAbsoluteHours: envInt('SESSION_ABS_TTL_HOURS', 12),
  cookieDomain: envStr('COOKIE_DOMAIN'),
  cookieSecure: envBool('COOKIE_SECURE', false) || envStr('APP_ENV', 'development') === 'production',
  trustProxy: envBool('TRUST_PROXY', false),
  publicBaseUrl: envStr('PUBLIC_BASE_URL', 'http://localhost:5173'),
  uploadDir: path.resolve(SERVER_DIR, envStr('UPLOAD_DIR', 'uploads')),
  clientDistDir: path.resolve(REPO_ROOT, envStr('CLIENT_DIST_DIR', 'dist')),
  maxUploadBytes: envInt('MAX_UPLOAD_BYTES', 12 * 1024 * 1024),
  corsOrigins: envStr('CORS_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

export function requireConfig() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required. Copy server/.env.example to server/.env and set the values.');
  }
  if (config.isProduction && config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
}