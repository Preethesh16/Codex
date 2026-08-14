const mongoose = require('mongoose');
const { encryptSecret, decryptSecret } = require('../services/credentialVault');

const encryptedString = { type: String, set: encryptSecret, get: decryptSecret };

const accountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    platform: {
        type: String,
        required: true,
        enum: ['youtube', 'facebook', 'instagram', 'linkedin', 'twitter'] // Expanded for all platforms
    },
    platformEmail: String, // Email associated with the platform account
    accessToken: encryptedString,
    refreshToken: encryptedString,
    oauthSecret: encryptedString, // For OAuth 1.0a (Twitter)
    expiryDate: Number
}, { toJSON: { getters: false }, toObject: { getters: false } });

module.exports = mongoose.model('Account', accountSchema);
