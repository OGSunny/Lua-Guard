const Database = require('../../lib/database');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return Utils.sendError(res, 'Method not allowed', 405);
    }

    try {
        const cookies = Utils.parseCookies(req);
        const sessionToken = cookies.session;

        if (sessionToken) {
            await Database.deleteSession(sessionToken);
            Utils.clearCookie(res, 'session');
        }

        if (req.method === 'GET') {
            Utils.redirect(res, '/');
        } else {
            Utils.sendJSON(res, { success: true });
        }
    } catch (error) {
        console.error('Logout error:', error);
        Utils.sendError(res, 'Failed to logout', 500);
    }
};
