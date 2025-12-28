const Database = require('../../lib/database');
const Security = require('../../lib/security');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
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

        if (req.method === 'GET') {
            // Get all integration settings
            const linkvertise = await Database.getIntegrationSettings('linkvertise');
            const lootlabs = await Database.getIntegrationSettings('lootlabs');

            return Utils.sendJSON(res, {
                success: true,
                settings: {
                    linkvertise: linkvertise ? {
                        publisher_id: linkvertise.publisher_id,
                        has_token: !!linkvertise.anti_bypass_token,
                        is_active: linkvertise.is_active
                    } : null,
                    lootlabs: lootlabs ? {
                        publisher_id: lootlabs.publisher_id,
                        has_key: !!lootlabs.api_key,
                        is_active: lootlabs.is_active
                    } : null
                }
            });
        }

        if (req.method === 'POST') {
            const body = await Utils.parseBody(req);
            const { integration_type, publisher_id, anti_bypass_token, api_key, webhook_url, is_active } = body;

            if (!integration_type) {
                return Utils.sendError(res, 'Integration type is required', 400);
            }

            await Database.updateIntegrationSettings(
                integration_type,
                publisher_id,
                anti_bypass_token,
                api_key,
                webhook_url
            );

            if (typeof is_active === 'boolean') {
                await Database.setIntegrationActive(integration_type, is_active);
            }

            await Database.logEvent('admin_settings_updated', session.discord_id, null, Security.getClientIP(req), null, {
                integration_type
            });

            return Utils.sendJSON(res, {
                success: true,
                message: 'Settings updated successfully'
            });
        }

        Utils.sendError(res, 'Method not allowed', 405);
    } catch (error) {
        console.error('Admin settings error:', error);
        Utils.sendError(res, 'Failed to update settings', 500);
    }
};
