import test from 'node:test';
import assert from 'node:assert/strict';
import { FinancePlanSchema, ORBIT_WORKFLOW_STAGES, OPENAI_MODELS, applyValidatedContextPatch, normalizeOpenAIError, redactForOpenAI, withRetry } from '../dist/openaiRuntime.js';

test('privacy gate redacts credentials and common personal identifiers', () => {
  const value = redactForOpenAI('email founder@example.com phone +91 9876543210 api_key=sk-exampleabcdefghijklmnop PAN ABCDE1234F');
  assert.doesNotMatch(value, /founder@example\.com/);
  assert.doesNotMatch(value, /9876543210/);
  assert.doesNotMatch(value, /sk-example/);
  assert.doesNotMatch(value, /ABCDE1234F/);
});

test('finance output requires allocations to sum to 100', () => {
  const base = { burnRate: 1000, runwayMonths: 12, infrastructureCost: 100, subscriptionCost: 50 };
  assert.equal(FinancePlanSchema.safeParse({ ...base, budgetAllocations: { engineering: 40, marketing: 30, sales: 20, operations: 10 } }).success, true);
  assert.equal(FinancePlanSchema.safeParse({ ...base, budgetAllocations: { engineering: 40, marketing: 30, sales: 20, operations: 20 } }).success, false);
});

test('context mutations reject fields outside the allowlisted patch schema', () => {
  const context = { business: {}, financials: {}, marketing: {}, product: {}, legal: {} };
  assert.throws(() => applyValidatedContextPatch(context, { founderProfile: { location: 'exfiltrate' } }));
  applyValidatedContextPatch(context, { business: { validationScore: 78 } });
  assert.equal(context.business.validationScore, 78);
});

test('workflow stages and model routing match the approved architecture', () => {
  assert.deepEqual(ORBIT_WORKFLOW_STAGES, [
    ['research'], ['finance', 'legal', 'brand'], ['conflict'], ['marketing', 'code', 'sales'],
  ]);
  assert.equal(OPENAI_MODELS.manager, 'gpt-5.6-sol');
  assert.equal(OPENAI_MODELS.specialist, 'gpt-5.6-terra');
  assert.equal(OPENAI_MODELS.fast, 'gpt-5.6-luna');
});

test('transient OpenAI errors retry while normalized errors redact secrets', async () => {
  let attempts = 0;
  const value = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('temporary'), { status: 429 });
    return 'ok';
  });
  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
  const normalized = normalizeOpenAIError(new Error('token=sk-exampleabcdefghijklmnop'), 'trace-test');
  assert.doesNotMatch(normalized.message, /sk-example/);
});
