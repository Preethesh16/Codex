const passport = require('passport');
const Account = require('../models/Account');
const youtubeService = require('../services/youtubeService');
const requireLogin = require('../middlewares/requireLogin');
const { createOAuthState, consumeOAuthState } = require('../services/oauthState');

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:8080';

module.exports = (app) => {
    app.get('/auth/google', passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: true
    }));

    app.get('/auth/google/callback',
        passport.authenticate('google', { failureRedirect: `${clientUrl()}/?login=failed` }),
        (_req, res) => res.redirect(`${clientUrl()}/dashboard`)
    );

    app.get('/api/current_user', (req, res) => res.send(req.user || null));

    app.post('/api/logout', (req, res, next) => {
        req.logout((error) => {
            if (error) return next(error);
            req.session.destroy((destroyError) => destroyError ? next(destroyError) : res.status(204).end());
        });
    });

    app.get('/api/connect/youtube', requireLogin, async (req, res) => {
        try {
            const state = createOAuthState(req.session, 'youtube');
            res.json({ url: await youtubeService.getAuthUrl(req.user._id, state) });
        } catch (error) {
            console.error('Error generating YouTube auth URL:', error);
            res.status(500).json({ error: 'Failed to initiate YouTube connection. Check server configuration.' });
        }
    });

    app.get('/connect/youtube/callback', requireLogin, async (req, res) => {
        try {
            if (!consumeOAuthState(req.session, 'youtube', req.query.state)) {
                return res.status(400).json({ error: 'Invalid or expired OAuth state' });
            }
            if (!req.query.code) return res.status(400).json({ error: 'Missing OAuth authorization code' });
            const tokens = await youtubeService.getTokens(req.query.code);
            const account = await Account.findOne({ userId: req.user._id, platform: 'youtube' });
            if (account) {
                account.accessToken = tokens.access_token;
                if (tokens.refresh_token) account.refreshToken = tokens.refresh_token;
                if (tokens.expiry_date) account.expiryDate = tokens.expiry_date;
                else if (tokens.expires_in) account.expiryDate = Date.now() + tokens.expires_in * 1000;
                await account.save();
            } else {
                await new Account({
                    userId: req.user._id,
                    platform: 'youtube',
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiryDate: tokens.expiry_date || (tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null)
                }).save();
            }
            res.redirect(`${clientUrl()}/dashboard/connections?connected=youtube`);
        } catch (error) {
            console.error('Error connecting YouTube account:', error);
            res.redirect(`${clientUrl()}/dashboard/connections?error=youtube_failed`);
        }
    });

    for (const unavailable of ['facebook', 'linkedin', 'twitter']) {
        app.get(`/api/connect/${unavailable}`, requireLogin, (_req, res) => res.status(501).json({
            error: `${unavailable} integration is unavailable; no OAuth flow was started.`
        }));
        app.get(`/connect/${unavailable}/callback`, requireLogin, (_req, res) => res.status(501).json({
            error: `${unavailable} integration is unavailable.`
        }));
    }
};
