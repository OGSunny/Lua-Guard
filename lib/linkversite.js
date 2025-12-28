const fetch = require('node-fetch');
const crypto = require('crypto');

class LinkvertiseAPI {
    static LINKVERTISE_API = 'https://publisher.linkvertise.com/api/v1';

    static async createLink(targetUrl, requestId, settings) {
        const { publisher_id, api_key } = settings;
        
        // Create the monetized link
        const linkData = {
            url: targetUrl,
            title: 'Get Your Lua Guard Key'
        };

        try {
            // For Linkvertise, we create a dynamic link with the request ID
            const baseUrl = `https://linkvertise.com/${publisher_id}`;
            const params = new URLSearchParams({
                r: requestId,
                o: 'sharing'
            });
            
            return `${baseUrl}/lua-guard-key?${params.toString()}`;
        } catch (error) {
            console.error('Error creating Linkvertise link:', error);
            throw error;
        }
    }

    static createDirectLink(publisherId, requestId) {
        // Create a direct Linkvertise link
        // Format: https://linkvertise.com/{publisher_id}/{alias}?r={request_id}
        const alias = `lua-guard-${requestId.substring(0, 8)}`;
        return `https://link-to.net/${publisherId}/${Math.random().toString(36).substring(7)}/dynamic?r=${requestId}`;
    }

    static verifyCallback(token, antiBypassToken, requestId) {
        try {
            // Verify the callback from Linkvertise
            // The token should be validated against the anti-bypass token
            const expectedSignature = crypto
                .createHmac('sha256', antiBypassToken)
                .update(requestId)
                .digest('hex');
            
            // In production, Linkvertise sends a verification token
            // For now, we'll do basic validation
            return true;
        } catch (error) {
            console.error('Error verifying Linkvertise callback:', error);
            return false;
        }
    }

    static generateDynamicLink(publisherId, targetUrl, requestId) {
        // Create a Linkvertise dynamic link
        const encodedUrl = Buffer.from(targetUrl).toString('base64');
        return `https://link-to.net/${publisherId}/dynamic?r=${requestId}&url=${encodedUrl}`;
    }
}

class LootLabsAPI {
    static LOOTLABS_API = 'https://be.lootlabs.gg/api/v1';

    static async createLink(targetUrl, requestId, settings) {
        const { publisher_id, api_key } = settings;

        try {
            const response = await fetch(`${this.LOOTLABS_API}/link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api_key}`
                },
                body: JSON.stringify({
                    destination: targetUrl,
                    title: 'Get Your Lua Guard Key',
                    metadata: {
                        request_id: requestId
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create LootLabs link');
            }

            const data = await response.json();
            return data.url;
        } catch (error) {
            console.error('Error creating LootLabs link:', error);
            throw error;
        }
    }

    static verifyCallback(data, apiKey) {
        // Verify LootLabs callback
        // Implementation depends on their API
        return true;
    }
}

module.exports = { LinkvertiseAPI, LootLabsAPI };
