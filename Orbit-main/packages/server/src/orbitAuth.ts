import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { Request } from 'express';
import { readJson, writeJsonAtomic } from './atomicJson.js';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'orbit_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

interface CredentialRecord {
  loginName: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

interface AuthState {
  sessionSecret: string;
  credential?: CredentialRecord;
}

export interface OrbitSession {
  loginName: string;
  expiresAt: number;
}

function validateLoginName(value: unknown): string {
  const loginName = typeof value === 'string' ? value.trim() : '';
  if (!loginName || loginName.length > 80) throw new Error('Login name must be between 1 and 80 characters.');
  return loginName;
}

function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.');
  return password;
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.cookie || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function createOrbitAuthStore(file: string) {
  const read = (): AuthState => readJson<AuthState>(file, { sessionSecret: '' });
  const save = (state: AuthState) => writeJsonAtomic(file, state);
  const secret = (state: AuthState): string => process.env.ORBIT_SESSION_SECRET || state.sessionSecret;

  const sign = (payload: string, state: AuthState): string => createHmac('sha256', secret(state)).update(payload).digest('base64url');

  return {
    hasCredential(): boolean {
      return Boolean(read().credential);
    },

    loginName(): string | undefined {
      return read().credential?.loginName;
    },

    async setup(loginNameInput: unknown, passwordInput: unknown): Promise<OrbitSession> {
      const state = read();
      if (state.credential) throw new Error('Orbit login has already been configured.');
      const loginName = validateLoginName(loginNameInput);
      const password = validatePassword(passwordInput);
      const salt = randomBytes(16);
      const passwordHash = await scrypt(password, salt, 64) as Buffer;
      state.sessionSecret ||= randomBytes(32).toString('base64url');
      state.credential = {
        loginName,
        salt: salt.toString('base64url'),
        passwordHash: passwordHash.toString('base64url'),
        createdAt: new Date().toISOString(),
      };
      save(state);
      return { loginName, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
    },

    async authenticate(loginNameInput: unknown, passwordInput: unknown): Promise<OrbitSession | undefined> {
      const state = read();
      const credential = state.credential;
      const loginName = typeof loginNameInput === 'string' ? loginNameInput.trim() : '';
      const password = typeof passwordInput === 'string' ? passwordInput : '';
      if (!credential || !password || credential.loginName.toLowerCase() !== loginName.toLowerCase()) return undefined;
      const actual = await scrypt(password, Buffer.from(credential.salt, 'base64url'), 64) as Buffer;
      const expected = Buffer.from(credential.passwordHash, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
      return { loginName: credential.loginName, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
    },

    sessionToken(session: OrbitSession): string {
      const state = read();
      const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
      return `${payload}.${sign(payload, state)}`;
    },

    verifyToken(token: string | undefined): OrbitSession | undefined {
      if (!token) return undefined;
      const state = read();
      if (!state.credential || !secret(state)) return undefined;
      const [payload, providedSignature] = token.split('.');
      if (!payload || !providedSignature) return undefined;
      const expectedSignature = sign(payload, state);
      const left = Buffer.from(expectedSignature);
      const right = Buffer.from(providedSignature);
      if (left.length !== right.length || !timingSafeEqual(left, right)) return undefined;
      try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OrbitSession;
        if (session.loginName !== state.credential.loginName || !Number.isSafeInteger(session.expiresAt)) return undefined;
        if (session.expiresAt <= Math.floor(Date.now() / 1000)) return undefined;
        return session;
      } catch {
        return undefined;
      }
    },

    sessionFromRequest(request: Request): OrbitSession | undefined {
      return this.verifyToken(cookieValue(request, COOKIE_NAME));
    },

    cookieFor(session: OrbitSession, secure = process.env.NODE_ENV === 'production'): string {
      const attributes = [`${COOKIE_NAME}=${encodeURIComponent(this.sessionToken(session))}`, 'Path=/', `Max-Age=${SESSION_SECONDS}`, 'HttpOnly', 'SameSite=Strict'];
      if (secure) attributes.push('Secure');
      return attributes.join('; ');
    },

    clearCookie(secure = process.env.NODE_ENV === 'production'): string {
      const attributes = [`${COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict'];
      if (secure) attributes.push('Secure');
      return attributes.join('; ');
    },
  };
}
