async function executeApprovedPublish({ approval, video, getAccount, uploadYouTube }) {
    if (!approval || approval.status !== 'executing' || !approval.decidedAt) {
        throw new Error('Publishing requires an explicitly approved request');
    }
    const results = [];
    for (const platform of approval.platforms) {
        if (platform !== 'youtube') {
            results.push({ platform, status: 'unavailable', message: `${platform} publishing is not implemented; no external call was made.` });
            continue;
        }
        const account = await getAccount('youtube');
        if (!account) {
            results.push({ platform, status: 'failed', message: 'No connected YouTube account' });
            continue;
        }
        try {
            const result = await uploadYouTube(account, {
                title: video.title,
                description: video.description,
                privacyStatus: approval.privacyStatus
            }, video.filePath);
            results.push({ platform, status: 'success', externalId: result.id });
            video.platformLogs.push({ platform, status: 'success', externalId: result.id, publishedAt: new Date() });
        } catch (error) {
            results.push({ platform, status: 'failed', message: error.message });
            video.platformLogs.push({ platform, status: 'failed', message: error.message });
        }
    }
    return results;
}

module.exports = { executeApprovedPublish };
