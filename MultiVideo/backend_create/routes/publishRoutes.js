const requireLogin = require('../middlewares/requireLogin');
const Video = require('../models/Video');
const Account = require('../models/Account');
const PublishApproval = require('../models/PublishApproval');
const youtubeService = require('../services/youtubeService');
const { normalizePublishRequest } = require('../services/publishingPolicy');

module.exports = (app) => {
    // Agent/tool-facing request endpoint: this never publishes by itself.
    app.post('/api/publish', requireLogin, async (req, res) => {
        try {
            const { videoId, platforms, privacyStatus } = req.body;
            const video = await Video.findOne({ _id: videoId, userId: req.user._id });
            if (!video) return res.status(404).json({ error: 'Video not found' });
            const normalized = normalizePublishRequest(platforms, privacyStatus);
            const approval = await PublishApproval.create({
                userId: req.user._id,
                videoId: video._id,
                platforms: normalized.platforms,
                privacyStatus: normalized.privacyStatus,
                status: 'pending'
            });
            video.status = 'awaiting_approval';
            await video.save();
            res.status(202).json({
                approvalId: approval._id,
                status: approval.status,
                requiresHumanApproval: true,
                unavailablePlatforms: normalized.unavailable,
                message: 'Nothing was published. Review and approve this request explicitly.'
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    app.get('/api/publish/requests', requireLogin, async (req, res) => {
        const requests = await PublishApproval.find({ userId: req.user._id }).sort({ requestedAt: -1 }).limit(100);
        res.json(requests);
    });

    app.post('/api/publish/requests/:id/reject', requireLogin, async (req, res) => {
        const approval = await PublishApproval.findOne({ _id: req.params.id, userId: req.user._id, status: 'pending' });
        if (!approval) return res.status(404).json({ error: 'Pending approval request not found' });
        approval.status = 'rejected';
        approval.decidedAt = new Date();
        await approval.save();
        await Video.updateOne({ _id: approval.videoId, userId: req.user._id }, { status: 'uploaded' });
        res.json({ approvalId: approval._id, status: approval.status });
    });

    // Explicit human action. Only the implemented YouTube adapter can execute.
    app.post('/api/publish/requests/:id/approve', requireLogin, async (req, res) => {
        const approval = await PublishApproval.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id, status: 'pending' },
            { status: 'executing', decidedAt: new Date() },
            { new: true }
        );
        if (!approval) return res.status(404).json({ error: 'Pending approval request not found or already decided' });
        const video = await Video.findOne({ _id: approval.videoId, userId: req.user._id });
        if (!video) {
            approval.status = 'failed';
            approval.results = [{ platform: 'all', status: 'failed', message: 'Video not found' }];
            await approval.save();
            return res.status(404).json({ error: 'Video not found' });
        }

        const results = [];
        for (const platform of approval.platforms) {
            if (platform !== 'youtube') {
                results.push({ platform, status: 'unavailable', message: `${platform} publishing is not implemented; no external call was made.` });
                continue;
            }
            const account = await Account.findOne({ userId: req.user._id, platform: 'youtube' });
            if (!account) {
                results.push({ platform, status: 'failed', message: 'No connected YouTube account' });
                continue;
            }
            try {
                const result = await youtubeService.uploadVideo(account, {
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

        const successes = results.filter((item) => item.status === 'success').length;
        approval.status = successes ? 'completed' : 'failed';
        approval.results = results;
        approval.completedAt = new Date();
        video.status = successes ? 'published' : 'uploaded';
        await Promise.all([approval.save(), video.save()]);
        res.json({ approvalId: approval._id, status: approval.status, results });
    });
};
