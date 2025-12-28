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
        // Check admin authentication
        const cookies = Utils.parseCookies(req);
        const sessionToken = cookies.session;

        if (!sessionToken) {
            return Utils.sendError(res, 'Authentication required', 401);
        }

        const session = await Database.getSession(sessionToken);
        
        if (!session || !session.is_admin) {
            return Utils.sendError(res, 'Admin access required', 403);
        }

        const { limit = 100, offset = 0 } = req.query;

        const users = await Database.getAllUsers(parseInt(limit), parseInt(offset));

        Utils.sendJSON(res, {
            success: true,
            users: users.map(u => ({
                discord_id: u.discord_id,
                username: u.discord_username,
                avatar: u.discord_avatar,
                join_date: u.join_date,
                is_banned: u.is_banned,
                ban_reason: u.ban_reason,
                is_admin: u.is_admin,
                is_whitelisted: u.is_whitelisted,
                total_keys_generated: u.total_keys_generated,
                last_login: u.last_login
            })),
            total: users.length
        });
    } catch (error) {
        console.error('Admin users error:', error);
        Utils.sendError(res, 'Failed to get users', 500);
    }
};
