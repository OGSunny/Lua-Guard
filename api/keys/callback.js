const Database = require('../../lib/database');
const Security = require('../../lib/security');
const { LinkvertiseAPI } = require('../../lib/linkvertise');
const DiscordAPI = require('../../lib/discord');
const Utils = require('../../lib/utils');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return Utils.sendJSON(res, { ok: true });
    }

    // Handle both GET (redirect) and POST (webhook)
    try {
        const requestId = req.query.r || req.query.requestId;
        const token = req.query.token || req.query.t;

        if (!requestId) {
            return res.writeHead(302, { Location: '/?error=invalid_request' }).end();
        }

        // Get pending key
        const pendingKey = await Database.getPendingKey(requestId);

        if (!pendingKey) {
            return res.writeHead(302, { Location: '/?error=request_expired' }).end();
        }

        // Get integration settings for verification
        const settings = await Database.getIntegrationSettings('linkvertise');

        // Verify the callback (if token provided)
        if (token && settings.anti_bypass_token) {
            const isValid = LinkvertiseAPI.verifyCallback(token, settings.anti_bypass_token, requestId);
            if (!isValid) {
                await Database.logEvent('linkvertise_bypass_attempt', pendingKey.discord_id, pendingKey.hwid, Security.getClientIP(req));
                return res.writeHead(302, { Location: '/?error=verification_failed' }).end();
            }
        }

        // Mark pending key as completed
        await Database.completePendingKey(requestId);

        // Generate the actual key
        const keyString = Security.generateKey();
        const expiresAt = Utils.getExpirationDate(24); // 24 hours

        const key = await Database.createKey(
            keyString,
            pendingKey.discord_id,
            pendingKey.hwid,
            expiresAt,
            Security.getClientIP(req)
        );

        // Bind HWID
        await Database.bindHWID(pendingKey.discord_id, pendingKey.hwid);

        // Log the event
        await Database.logEvent('key_generated', pendingKey.discord_id, pendingKey.hwid, Security.getClientIP(req), null, {
            keyId: key.id,
            requestId: requestId
        });

        // Get user for notification
        const user = await Database.getUser(pendingKey.discord_id);
        if (user) {
            await DiscordAPI.notifyKeyGenerated(user, key);
        }

        // Redirect to success page with key
        const successUrl = `/dashboard?key=${encodeURIComponent(keyString)}&success=true`;
        res.writeHead(302, { Location: successUrl });
        res.end();
    } catch (error) {
        console.error('Linkvertise callback error:', error);
        res.writeHead(302, { Location: '/?error=callback_failed' });
        res.end();
    }
};
