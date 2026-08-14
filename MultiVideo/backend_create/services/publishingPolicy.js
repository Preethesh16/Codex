const AVAILABLE_PLATFORMS = new Set(['youtube']);

function normalizePublishRequest(platforms, privacyStatus) {
    const unique = [...new Set(Array.isArray(platforms) ? platforms.map(String) : [])];
    if (!unique.length) throw new Error('At least one platform is required');
    const supportedPrivacy = new Set(['private', 'unlisted', 'public']);
    return {
        platforms: unique,
        privacyStatus: supportedPrivacy.has(privacyStatus) ? privacyStatus : 'private',
        unavailable: unique.filter((platform) => !AVAILABLE_PLATFORMS.has(platform))
    };
}

module.exports = { AVAILABLE_PLATFORMS, normalizePublishRequest };
