const DiscordAPI = require('../../lib/discord');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    if (req.method !== 'GET') {
        return Utils.sendError(res, 'Method not allowed', 405);
    }

    try {
        const authUrl = DiscordAPI.getOAuthURL();
        Utils.redirect(res, authUrl);
    } catch (error) {
        console.error('Discord auth error:', error);
        Utils.sendError(res, 'Failed to initiate Discord login', 500);
    }
};
