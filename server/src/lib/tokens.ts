import { randomBytes, createHash } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short token used for one-time account invitation links. */
export function makeSignupToken(bytes = 24): string {
  return randomToken(bytes);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface RecoveryCodeSet {
  codes: string[]; // plaintext, shown once to the user
  hashed: string[]; // sha256 hashes to store
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing characters

function randomGroup(length = 4): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export function generateRecoveryCodes(count = 10): RecoveryCodeSet {
  const codes: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `${randomGroup()}-${randomGroup()}-${randomGroup()}`;
    codes.push(code);
    hashed.push(hashToken(code.toUpperCase()));
  }
  return { codes, hashed };
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}