const DiscordAPI = require('../../lib/discord');
const Database = require('../../lib/database');
const Security = require('../../lib/security');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return Utils.sendError(res, 'Method not allowed', 405);
    }

    const { code, error: oauthError } = req.query;

    if (oauthError) {
        return Utils.redirect(res, '/?error=oauth_denied');
    }

    if (!code) {
        return Utils.redirect(res, '/?error=no_code');
    }

    try {
        // Exchange code for token
        const tokenData = await DiscordAPI.exchangeCode(code);
        
        // Get user info
        const discordUser = await DiscordAPI.getUser(tokenData.access_token);
        
        // Check if user is in the required server
        const isInServer = await DiscordAPI.isUserInServer(tokenData.access_token);
        
        if (!isInServer) {
            return Utils.redirect(res, `/?error=not_in_server&invite=${process.env.DISCORD_INVITE_URL || ''}`);
        }

        // Create or update user in database
        const user = await Database.createUser(
            discordUser.id,
            discordUser.username,
            discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
            discordUser.email
        );

        // Check if banned
        if (user.is_banned) {
            return Utils.redirect(res, '/?error=banned');
        }

        // Create session
        const sessionToken = Security.generateSessionToken();
        const expiresAt = Utils.getExpirationDate(24 * 7); // 7 days
        
        await Database.createSession(sessionToken, discordUser.id, expiresAt);

        // Set session cookie
        Utils.setCookie(res, 'session', sessionToken, {
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        // Log analytics
        await Database.logEvent('user_login', discordUser.id, null, Security.getClientIP(req), req.headers['user-agent']);

        // Notify via webhook (for new users)
        if (user.total_keys_generated === 0) {
            await DiscordAPI.notifyNewUser(user);
        }

        // Redirect to dashboard
        Utils.redirect(res, '/dashboard');
    } catch (error) {
        console.error('Callback error:', error);
        Utils.redirect(res, '/?error=auth_failed');
    }
};
