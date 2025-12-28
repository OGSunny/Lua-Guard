const DiscordAPI = require('../../lib/discord');
const Database = require('../../lib/database');
const Security = require('../../lib/security');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    if (req.method !== 'GET') {
        return Utils.sendError(res, 'Method not allowed', 405);
    }

    try {
        const cookies = Utils.parseCookies(req);
        const sessionToken = cookies.session;

        if (!sessionToken) {
            return Utils.sendJSON(res, { authenticated: false });
        }

        const session = await Database.getSession(sessionToken);
        
        if (!session) {
            Utils.clearCookie(res, 'session');
            return Utils.sendJSON(res, { authenticated: false });
        }

        // Check if still in server via bot
        const isInServer = await DiscordAPI.checkUserInServerViaBot(session.discord_id);

        Utils.sendJSON(res, {
            authenticated: true,
            inServer: isInServer,
            user: {
                discord_id: session.discord_id,
                username: session.discord_username,
                avatar: session.discord_avatar,
                is_admin: session.is_admin,
                is_banned: session.is_banned,
                is_whitelisted: session.is_whitelisted
            }
        });
    } catch (error) {
        console.error('Check server error:', error);
        Utils.sendError(res, 'Failed to check server membership', 500);
    }
};
