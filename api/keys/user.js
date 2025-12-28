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
            return Utils.sendError(res, 'Authentication required', 401);
        }

        const session = await Database.getSession(sessionToken);
        
        if (!session) {
            Utils.clearCookie(res, 'session');
            return Utils.sendError(res, 'Session expired', 401);
        }

        const keys = await Database.getUserKeys(session.discord_id);
        const hwids = await Database.getHWIDBindings(session.discord_id);

        // Format keys for response
        const formattedKeys = keys.map(key => ({
            id: key.id,
            key: key.key_string,
            hwid: key.hwid.substring(0, 8) + '...',
            created_at: key.created_at,
            expires_at: key.expires_at,
            is_active: key.is_active && new Date(key.expires_at) > new Date(),
            time_remaining: Utils.formatTimeRemaining(key.expires_at),
            validation_count: key.validation_count
        }));

        Utils.sendJSON(res, {
            success: true,
            keys: formattedKeys,
            hwids: hwids.map(h => ({
                hwid: h.hwid.substring(0, 8) + '...',
                first_seen: h.first_seen,
                last_seen: h.last_seen
            })),
            total_generated: keys.length
        });
    } catch (error) {
        console.error('Get user keys error:', error);
        Utils.sendError(res, 'Failed to get keys', 500);
    }
};
