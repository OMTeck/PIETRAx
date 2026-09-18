# Security

This document describes the security model of the PIETRAx platform. It is intended for maintainers and anyone deploying or auditing the application.

## Threat model recap

The site is a public marketing/catalog SPA (materials, collections, projects, contact requests, quotes). The admin panel is an authenticated, MFA-protected back office. Sensitive operations are: reading customer contact data, mutating catalog content, and managing staff accounts.

## Authentication

- Credentials: email + password. Passwords are hashed with **Argon2id** (`@node-rs/argon2`, OWASP parameters: m=19456, t=2, p=1) with the library's per-hash random salt; verification is constant-time. Format is the library's encoded string (algorithm, params, salt, digest).
- **TOTP two-factor authentication** (`otplib`, SHA-1, 30s, ±1 step): optional per account, recommended and expected for `OWNER`/`ADMIN`. Enrollment flow: `/api/auth/mfa/setup/start` (requires current password) returns a secret + otpauth QR data; `/api/auth/mfa/setup/confirm` verifies one TOTP code and returns 10 one-time recovery codes (shown once). Recovery codes are stored as SHA-256 hashes; a successful login says `mfaRequired: true` and the account may not reach privileged admin state (`requireAuth`) until `/api/auth/mfa/verify` succeeds.
- **Session management** is server-side, stored via the Prisma session store (row per session, JSON-serialized payload). Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true` (or in production). Idle TTL and absolute TTL are enforced (`SESSION_IDLE_TTL_MINUTES`, `SESSION_ABS_TTL_HOURS`). When MFA changes, a password resets, or an account is suspended/deleted, all existing sessions for the account are revoked. `DELETE /api/auth/session` logs out the current session; `/api/auth/sessions` lists and revokes sessions.
- Brute-force protection: login and MFA endpoints are protected by strict rate limiters (per IP + per email with escalating blocks after repeated failure).
- Lost-2FA recovery is a real problem: an OWNER who is still signed in can re-enroll from the Security settings. As a last resort an operator can rotate the password from `server/scripts/manage-users.mjs`, which revokes all sessions; the account then signs in and re-enrolls MFA immediately (see the script header).

## Authorization

- RBAC with **default-deny**: roles (`OWNER`, `ADMIN`, `CONTENT_EDITOR`, `SALES`, `VIEWER`) grant an explicit allow-list of permissions (`server/src/authz/permissions.ts`). Every admin route checks at least `requirePermission(PERM.*)`; publishing actions additionally request the relevant `*Publish` permission.
- All permissions are re-checked on every request — there is no cached privilege set.
- Admin API is scoped under `/api/admin`; public site reads flow through a separate, read-only public router that never exposes staff/customer data.

## Data protection

- Uploads are signature-sniffed and re-encoded to WebP. File content is never trusted from the client-provided filename or MIME type. Stored under opaque UUID names; directory traversal is blocked by using `path.basename` + UUID filenames only. Never served with a user-controlled path.
- Contact requests, quote bookings, and audit events are server-side records; contact email/phone data is only available to roles with `customers.view`.
- SQL: all queries go through Prisma; parameterized queries. Uploaded metadata and body fields validated with Zod (`server/src/lib/validate.ts`) before touching the DB.
- HTML/JSON introspection: `x-powered-by` disabled; JSON error payloads never leak stack traces in production responses (details logged server-side only).

## Transport & headers

- TLS/HTTPS is expected at the edge (reverse proxy / CDN). `TRUST_PROXY=true` must be set in production behind a proxy so rate-limit/session IP handling and `Secure` cookie detection are correct.
- Security headers set on every response (`server/src/http/security.ts`): `Content-Security-Policy` (frame-ancestors, default-src self, script-src self, style-src self 'unsafe-inline', img-src self data: blob:), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` (when `COOKIE_SECURE`), `X-Frame-Options`.
- CORS is allow-listed by `CORS_ORIGINS`; the SPA uses same-origin Cookies + CSRF token (see below), so CORS preflight is minimal.

## CSRF

- Double-submit CSRF token (signed pair) issued by `GET /api/auth/csrf` via an `HttpOnly`'ish cookie `pietrax.csrf` and echoed in the `X-CSRF-Token` request header for every mutating request under `/api` (`server/src/http/csrf.ts`, `csrf-csrf` v3). Non-GET requests without a valid header/cookie pair are rejected with 403. Token rotates on login/logout/MFA transitions.
- Because the token is signed and bound to the session secret, a cross-site attacker cannot forge the header cookie.

## Admin SPA hidden by default confidence

- The admin client is built under `/admin` at runtime only when site settings declare `admin_enabled=true`. In a default deployment the admin bundle simply does not exist on disk.

## Secrets & configuration

- Required env (see `server/.env.example`): `DATABASE_URL`, `SESSION_SECRET` and `CSRF_SECRET` (>= 32 chars; generate with `openssl rand -hex 32`). Production refuses to boot with a short `SESSION_SECRET`.
- `.env` files are gitignored; never commit real secrets. Rotate secrets after any leak; rotating `SESSION_SECRET` invalidates all sessions and CSRF tokens.
- Admin roles' MFA secrets and recovery codes are stored hashed where supported by the schema; recovery codes are only shown once at enrollment.

## Rate limiting

- Global API limiter plus strict limiters on login, MFA verify, MFA recovery, media upload, and the public contact/quote endpoints. Limits are per IP (and per email where relevant) with `rate-limit-redis` moved to the in-memory fallback when Redis is absent — fine for single-instance, weak for multi-instance (enable Redis in production).

## Session/event logging

- Every security-relevant event (login success/failure, MFA enroll/verify/recover, role changes, publish/delete of catalog rows, media delete) is written to the audit trail (`server/src/lib/audit.ts`) with actor, timestamp, resource and metadata. `/api/admin/audit-log` requires `audit.view`.
- Structured application logging via pino; errors logged at `error` level never expose secrets or token material.

## Known operator duties

1. Keep secrets ≥ 32 random bytes and unique per environment.
2. Always deploy behind HTTPS with `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and a properly configured `COOKIE_DOMAIN`.
3. Enroll TOTP for the owner and every `OWNER`/`ADMIN` account before going live; keep the recovery codes offline.
4. Back up the Postgres database; the audit trail is the source of truth for "what happened and who did it".
5. Do not leave `OWNER` accounts without MFA enabled.
6. On staff departure: suspend the account (`/api/admin/users/:id` status) — sessions are revoked on suspension.

## Vulnerability reporting

Prefer a private report to the project owner before any public disclosure.