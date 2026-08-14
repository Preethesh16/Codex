import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineStoryboard } from '../dist/creative.js';

test('offline media fallback is complete and deterministic', () => {
  const first = offlineStoryboard('Orbit Test');
  const second = offlineStoryboard('Orbit Test');
  assert.deepEqual(first, second);
  assert.equal(first.shots.length, 4);
  assert.equal(first.shots.reduce((seconds, shot) => seconds + shot.durationSec, 0), 8);
  assert.match(first.shots[1].onScreenText, /Orbit Test/);
});
