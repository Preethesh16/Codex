const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePublishRequest } = require('../services/publishingPolicy');
process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-that-is-never-used-in-production';
const { encryptSecret, decryptSecret } = require('../services/credentialVault');
const { executeApprovedPublish } = require('../services/approvedPublisher');
const { createYouTubePublishTool } = require('../services/youtubePublishTool');

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

test('OpenAI YouTube tool requires native approval and only queues a pending request', async () => {
    let requests = 0;
    let uploads = 0;
    const publishTool = createYouTubePublishTool({
        requestApproval: async (input) => {
            requests += 1;
            assert.deepEqual(input.platforms, ['youtube']);
            assert.equal(input.privacyStatus, 'private');
            return { approvalId: 'approval-1', status: 'pending' };
        },
        uploadYouTube: async () => { uploads += 1; }
    });

    const input = JSON.stringify({ videoId: 'video-1', privacyStatus: 'private', reason: 'Founder requested launch' });
    assert.equal(publishTool.name, 'request_youtube_publish');
    assert.equal(await publishTool.needsApproval({}, input), true);
    assert.deepEqual(await publishTool.invoke({}, input), {
        approvalId: 'approval-1', status: 'pending', requiresHumanApproval: true,
        message: 'Nothing was published. Approve the pending request in MultiVideo.'
    });
    assert.equal(requests, 1);
    assert.equal(uploads, 0);
});
