const crypto = require('crypto');

function createOAuthState(session, platform) {
    if (!session) throw new Error('OAuth requires a server session');
    const value = crypto.randomBytes(32).toString('base64url');
    session.oauthStates = { ...(session.oauthStates || {}), [platform]: value };
    return value;
}

function consumeOAuthState(session, platform, candidate) {
    const expected = session?.oauthStates?.[platform];
    if (session?.oauthStates) delete session.oauthStates[platform];
    if (!expected || !candidate) return false;
    const left = Buffer.from(String(expected));
    const right = Buffer.from(String(candidate));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = { createOAuthState, consumeOAuthState };
