import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, createRateLimit, isAllowedOrigin } from '../dist/httpPolicy.js';

test('Orbit browser policy accepts configured origins and rejects others', () => {
  const allowed = allowedOrigins('https://orbit.example, http://localhost:5173');
  assert.equal(isAllowedOrigin(undefined, allowed), true);
  assert.equal(isAllowedOrigin('https://orbit.example', allowed), true);
  assert.equal(isAllowedOrigin('https://evil.example', allowed), false);
});

test('Orbit AI limiter bounds requests and returns retry guidance', () => {
  const middleware = createRateLimit(1, 60_000);
  const request = { ip: '127.0.0.1', baseUrl: '/api', path: '/creative' };
  let nextCalls = 0;
  let status;
  const response = {
    set: () => response,
    status: (value) => { status = value; return response; },
    json: () => response,
  };
  middleware(request, response, () => { nextCalls += 1; });
  middleware(request, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(status, 429);
});
