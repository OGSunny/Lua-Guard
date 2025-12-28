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

        const stats = await Database.getStats();

        Utils.sendJSON(res, {
            success: true,
            stats
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        Utils.sendError(res, 'Failed to get stats', 500);
    }
};
