const Database = require('../../lib/database');
const Security = require('../../lib/security');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    if (req.method !== 'POST') {
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

        const body = await Utils.parseBody(req);
        const { discord_id, action, reason, hwid } = body;

        if (!discord_id && !hwid) {
            return Utils.sendError(res, 'Discord ID or HWID is required', 400);
        }

        if (!action || !['ban', 'unban', 'whitelist', 'unwhitelist'].includes(action)) {
            return Utils.sendError(res, 'Valid action is required (ban/unban/whitelist/unwhitelist)', 400);
        }

        let result;

        if (hwid && action === 'ban') {
            // Ban HWID
            result = await Database.banHWID(hwid);
            await Database.logEvent('admin_hwid_ban', session.discord_id, hwid, Security.getClientIP(req));
        } else if (discord_id) {
            switch (action) {
                case 'ban':
                    result = await Database.banUser(discord_id, reason);
                    await Database.logEvent('admin_user_ban', session.discord_id, null, Security.getClientIP(req), null, { target: discord_id, reason });
                    break;
                case 'unban':
                    result = await Database.unbanUser(discord_id);
                    await Database.logEvent('admin_user_unban', session.discord_id, null, Security.getClientIP(req), null, { target: discord_id });
                    break;
                case 'whitelist':
                    result = await Database.setWhitelisted(discord_id, true);
                    await Database.logEvent('admin_user_whitelist', session.discord_id, null, Security.getClientIP(req), null, { target: discord_id });
                    break;
                case 'unwhitelist':
                    result = await Database.setWhitelisted(discord_id, false);
                    await Database.logEvent('admin_user_unwhitelist', session.discord_id, null, Security.getClientIP(req), null, { target: discord_id });
                    break;
            }
        }

        Utils.sendJSON(res, {
            success: true,
            message: `${action} action completed successfully`,
            result
        });
    } catch (error) {
        console.error('Admin ban error:', error);
        Utils.sendError(res, 'Failed to perform action', 500);
    }
};
