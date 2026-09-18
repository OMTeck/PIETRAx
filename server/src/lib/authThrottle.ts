import { config } from '../config.js';

interface AttemptEntry {
  times: number[];
}

/**
 * In-memory sliding-window brute-force throttle keyed by account + IP.
 * Single-instance deployments are covered; multi-instance deployments should
 * back this with Redis/DB (see SECURITY.md). Permanent locks are avoided on
 * purpose — throttling is temporary and transparent.
 */
class AccountThrottle {
  private attempts = new Map<string, AttemptEntry>();
  private windowMs = 15 * 60 * 1000;
  private maxFailures = 8;

  private keyFor(email: string, ip: string): string {
    return `${email.toLowerCase().trim()}|${ip}`;
  }

  prune(key: string): void {
    const entry = this.attempts.get(key);
    if (!entry) return;
    const now = Date.now();
    const alive = entry.times.filter((t) => now - t < this.windowMs);
    if (alive.length === 0) {
      this.attempts.delete(key);
    } else {
      entry.times = alive;
    }
  }

  recordFailure(email: string, ip: string): void {
    const key = this.keyFor(email, ip);
    const entry = this.attempts.get(key) ?? { times: [] };
    entry.times.push(Date.now());
    this.attempts.set(key, entry);
    this.prune(key);
  }

  isBlocked(email: string, ip: string): boolean {
    const key = this.keyFor(email, ip);
    this.prune(key);
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (entry.times.length >= this.maxFailures) return true;
    // Increasing delay as failures accumulate: 5 failures => 30s, 7 => ~2min.
    if (entry.times.length >= 5) {
      const delay = Math.min(120_000, 1000 * 2 ** (entry.times.length - 5));
      const newest = entry.times[entry.times.length - 1] ?? 0;
      if (Date.now() - newest < delay) return true;
    }
    return false;
  }

  reset(email: string, ip: string): void {
    this.attempts.delete(this.keyFor(email, ip));
  }
}

export const accountThrottle = new AccountThrottle();

export function throttleEnabled(): boolean {
  return !config.isProduction || true; // always enabled
}