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
        const { requestId } = body;

        if (!requestId) {
            return Utils.sendError(res, 'Request ID is required', 400);
        }

        const pendingKey = await Database.getPendingKey(requestId);

        if (!pendingKey) {
            return Utils.sendJSON(res, {
                success: false,
                status: 'not_found',
                message: 'Request not found or expired'
            });
        }

        if (pendingKey.is_completed) {
            // Check if a key was generated
            const key = await Database.getActiveUserKey(pendingKey.discord_id, pendingKey.hwid);
            
            if (key) {
                return Utils.sendJSON(res, {
                    success: true,
                    status: 'completed',
                    key: key.key_string,
                    expires_at: key.expires_at
                });
            }
        }

        Utils.sendJSON(res, {
            success: true,
            status: 'pending',
            message: 'Waiting for verification completion'
        });
    } catch (error) {
        console.error('Check key status error:', error);
        Utils.sendError(res, 'Failed to check status', 500);
    }
};
