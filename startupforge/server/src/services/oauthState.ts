import crypto from 'crypto';

const states = new Map<string, number>();
const lifetimeMs = 10 * 60_000;

export function createOAuthState(now = Date.now()): string {
  for (const [state, expiresAt] of states) if (expiresAt <= now) states.delete(state);
  const state = crypto.randomBytes(32).toString('base64url');
  states.set(state, now + lifetimeMs);
  return state;
}

export function consumeOAuthState(candidate: unknown, now = Date.now()): boolean {
  if (typeof candidate !== 'string') return false;
  const expiresAt = states.get(candidate);
  states.delete(candidate);
  if (!expiresAt || expiresAt <= now) return false;
  return true;
}
