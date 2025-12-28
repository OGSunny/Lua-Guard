const Database = require('../../lib/database');
const Security = require('../../lib/security');
const { LinkvertiseAPI, LootLabsAPI } = require('../../lib/linkvertise');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    if (req.method !== 'POST') {
        return Utils.sendError(res, 'Method not allowed', 405);
    }

    try {
        const cookies = Utils.parseCookies(req);
        const sessionToken = cookies.session;
        const body = await Utils.parseBody(req);
        const { hwid } = body;

        // Validate HWID
        if (!Security.validateHWID(hwid)) {
            return Utils.sendError(res, 'Invalid HWID', 400);
        }

        // Check authentication
        let user = null;
        if (sessionToken) {
            const session = await Database.getSession(sessionToken);
            if (session) {
                user = await Database.getUser(session.discord_id);
            }
        }

        if (!user) {
            return Utils.sendError(res, 'Authentication required', 401);
        }

        if (user.is_banned) {
            return Utils.sendError(res, 'You are banned', 403);
        }

        // Check if HWID is banned
        const hwidBanned = await Database.isHWIDBanned(hwid);
        if (hwidBanned) {
            return Utils.sendError(res, 'This device is banned', 403);
        }

        // Rate limiting
        const rateLimit = Security.rateLimit(`keygen:${user.discord_id}`, 5, 3600000); // 5 per hour
        if (!rateLimit.allowed) {
            return Utils.sendError(res, 'Rate limit exceeded. Try again later.', 429);
        }

        // Check for existing active key
        const existingKey = await Database.getActiveUserKey(user.discord_id, hwid);
        if (existingKey) {
            return Utils.sendJSON(res, {
                success: true,
                hasActiveKey: true,
                key: existingKey.key_string,
                expires_at: existingKey.expires_at
            });
        }

        // Check if user is whitelisted (skip Linkvertise)
        if (user.is_whitelisted) {
            const keyString = Security.generateKey();
            const expiresAt = Utils.getExpirationDate(24);
            
            const key = await Database.createKey(
                keyString,
                user.discord_id,
                hwid,
                expiresAt,
                Security.getClientIP(req)
            );

            await Database.bindHWID(user.discord_id, hwid);
            await Database.logEvent('key_generated_whitelist', user.discord_id, hwid, Security.getClientIP(req));

            return Utils.sendJSON(res, {
                success: true,
                key: keyString,
                expires_at: expiresAt,
                whitelisted: true
            });
        }

        // Get integration settings
        const settings = await Database.getIntegrationSettings('linkvertise');
        
        if (!settings || !settings.publisher_id) {
            return Utils.sendError(res, 'Key system not configured', 500);
        }

        // Create pending key request
        const requestId = Security.generateRequestId();
        const pendingExpires = Utils.getExpirationDate(1); // 1 hour to complete

        await Database.createPendingKey(
            requestId,
            user.discord_id,
            hwid,
            pendingExpires,
            Security.getClientIP(req)
        );

        // Create callback URL
        const baseUrl = process.env.BASE_URL || 'https://lua-guard-test.vercel.app';
        const callbackUrl = `${baseUrl}/api/linkvertise/callback?r=${requestId}`;

        // Generate Linkvertise link
        let monetizedLink;
        if (settings.integration_type === 'lootlabs') {
            monetizedLink = await LootLabsAPI.createLink(callbackUrl, requestId, settings);
        } else {
            monetizedLink = LinkvertiseAPI.createDirectLink(settings.publisher_id, requestId);
        }

        await Database.logEvent('key_generation_started', user.discord_id, hwid, Security.getClientIP(req), null, { requestId });

        Utils.sendJSON(res, {
            success: true,
            requiresVerification: true,
            verificationUrl: monetizedLink,
            requestId: requestId,
            expiresIn: 3600 // 1 hour
        });
    } catch (error) {
        console.error('Key generation error:', error);
        Utils.sendError(res, 'Failed to generate key', 500);
    }
};
