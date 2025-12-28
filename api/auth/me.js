const Database = require('../../lib/database');
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
            return Utils.sendError(res, 'Not authenticated', 401);
        }

        const session = await Database.getSession(sessionToken);
        
        if (!session) {
            Utils.clearCookie(res, 'session');
            return Utils.sendError(res, 'Session expired', 401);
        }

        const user = await Database.getUser(session.discord_id);

        Utils.sendJSON(res, {
            success: true,
            user: {
                discord_id: user.discord_id,
                username: user.discord_username,
                avatar: user.discord_avatar,
                is_admin: user.is_admin,
                is_banned: user.is_banned,
                is_whitelisted: user.is_whitelisted,
                total_keys_generated: user.total_keys_generated,
                join_date: user.join_date
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        Utils.sendError(res, 'Failed to get user', 500);
    }
};
