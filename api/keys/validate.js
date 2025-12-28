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
        const body = await Utils.parseBody(req);
        const { key, hwid } = body;

        // Get HWID from header if not in body
        const clientHWID = hwid || req.headers['x-hwid'];

        if (!key) {
            return Utils.sendError(res, 'Key is required', 400);
        }

        if (!Security.validateHWID(clientHWID)) {
            return Utils.sendError(res, 'Invalid HWID', 400);
        }

        // Rate limiting
        const rateLimit = Security.rateLimit(`validate:${clientHWID}`, 30, 60000); // 30 per minute
        if (!rateLimit.allowed) {
            return Utils.sendError(res, 'Rate limit exceeded', 429);
        }

        // Check if HWID is banned
        const hwidBanned = await Database.isHWIDBanned(clientHWID);
        if (hwidBanned) {
            return Utils.sendJSON(res, {
                success: false,
                valid: false,
                error: 'This device is banned'
            });
        }

        // Validate the key
        const result = await Database.validateKey(key, clientHWID);

        if (!result.valid) {
            await Database.logEvent('key_validation_failed', null, clientHWID, Security.getClientIP(req), req.headers['user-agent'], {
                key: key.substring(0, 10) + '...',
                error: result.error
            });

            return Utils.sendJSON(res, {
                success: false,
                valid: false,
                error: result.error
            });
        }

        await Database.logEvent('key_validated', result.key.discord_id, clientHWID, Security.getClientIP(req));

        Utils.sendJSON(res, {
            success: true,
            valid: true,
            expires_at: result.expires_at,
            is_whitelisted: result.is_whitelisted,
            time_remaining: Utils.formatTimeRemaining(result.expires_at)
        });
    } catch (error) {
        console.error('Key validation error:', error);
        Utils.sendError(res, 'Failed to validate key', 500);
    }
};
