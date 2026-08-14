const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePublishRequest } = require('../services/publishingPolicy');
process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-that-is-never-used-in-production';
const { encryptSecret, decryptSecret } = require('../services/credentialVault');
const { executeApprovedPublish } = require('../services/approvedPublisher');

test('publishing defaults to private and identifies unavailable adapters', () => {
    const request = normalizePublishRequest(['youtube', 'linkedin', 'youtube'], 'invalid');
    assert.deepEqual(request.platforms, ['youtube', 'linkedin']);
    assert.equal(request.privacyStatus, 'private');
    assert.deepEqual(request.unavailable, ['linkedin']);
});

test('OAuth credentials are encrypted at rest and decrypt for adapters', () => {
    const encrypted = encryptSecret('refresh-token-value');
    assert.match(encrypted, /^enc:v1:/);
    assert.doesNotMatch(encrypted, /refresh-token-value/);
    assert.equal(decryptSecret(encrypted), 'refresh-token-value');
});

test('publishing requires at least one explicit platform', () => {
    assert.throws(() => normalizePublishRequest([], 'public'), /At least one platform/);
});

test('publishing adapter cannot execute before explicit approval', async () => {
    let uploads = 0;
    const video = { title: 'Demo', description: '', filePath: '/tmp/demo.mp4', platformLogs: [] };
    await assert.rejects(() => executeApprovedPublish({
        approval: { status: 'pending', decidedAt: null, platforms: ['youtube'], privacyStatus: 'private' },
        video,
        getAccount: async () => ({ accessToken: 'not-used' }),
        uploadYouTube: async () => { uploads += 1; return { id: 'external' }; }
    }), /explicitly approved/);
    assert.equal(uploads, 0);
    assert.equal(video.platformLogs.length, 0);
});
