const mongoose = require('mongoose');

const publishApprovalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
    platforms: [{ type: String, enum: ['youtube', 'facebook', 'instagram', 'linkedin', 'twitter'] }],
    privacyStatus: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'executing', 'completed', 'failed'], default: 'pending', index: true },
    reason: { type: String, default: 'Publish generated media to selected external platforms' },
    results: { type: Array, default: [] },
    requestedAt: { type: Date, default: Date.now },
    decidedAt: Date,
    completedAt: Date
});

module.exports = mongoose.model('PublishApproval', publishApprovalSchema);
