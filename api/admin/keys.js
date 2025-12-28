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

        const keys = await Database.getAllKeys(parseInt(limit), parseInt(offset));

        Utils.sendJSON(res, {
            success: true,
            keys: keys.map(k => ({
                id: k.id,
                key: k.key_string,
                discord_id: k.discord_id,
                discord_username: k.discord_username,
                hwid: k.hwid.substring(0, 8) + '...',
                created_at: k.created_at,
                expires_at: k.expires_at,
                is_active: k.is_active,
                is_expired: new Date(k.expires_at) < new Date(),
                validation_count: k.validation_count,
                last_validated: k.last_validated
            })),
            total: keys.length
        });
    } catch (error) {
        console.error('Admin keys error:', error);
        Utils.sendError(res, 'Failed to get keys', 500);
    }
};
