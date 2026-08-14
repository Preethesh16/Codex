import type { RequestHandler } from 'express';

export function allowedOrigins(configured = process.env.ORBIT_CLIENT_URL || 'http://localhost:3000'): Set<string> {
  return new Set(configured.split(',').map((value) => value.trim()).filter(Boolean));
}

export function isAllowedOrigin(origin: string | undefined, allowed: Set<string>): boolean {
  return !origin || allowed.has(origin);
}

export function createRateLimit(limit: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many AI requests; retry later.' });
    }
    next();
  };
}
