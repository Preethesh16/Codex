import test from 'node:test';
import assert from 'node:assert/strict';
import { startupForgeProfileFromContext } from '../dist/startupForgeBridge.js';

test('Orbit to StartupForge handoff omits founder identity and location', () => {
  const profile = startupForgeProfileFromContext({
    companyName: 'Orbit Demo',
    founderProfile: { vision: 'Solve a workflow problem', location: 'Private Location' },
    business: { niche: 'SaaS', stage: 'GTM', targetMarket: 'Teams', tam: '$1B' },
    product: { features: ['Dashboard'], techStack: ['React'] },
    marketing: { taglines: ['Move faster'], brandVoice: 'Clear' },
  });
  assert.equal(profile.founderName, '');
  assert.equal(profile.location, '');
  assert.doesNotMatch(JSON.stringify(profile), /Private Location/);
  assert.equal(profile.businessName, 'Orbit Demo');
});
