const fetch = require('node-fetch');

class DiscordAPI {
    static DISCORD_API = 'https://discord.com/api/v10';
    
    static getOAuthURL() {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const redirectUri = encodeURIComponent(`${process.env.BASE_URL || 'https://lua-guard-test.vercel.app'}/api/auth/callback`);
        const scope = encodeURIComponent('identify email guilds');
        
        return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    }

    static async exchangeCode(code) {
        const params = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: `${process.env.BASE_URL || 'https://lua-guard-test.vercel.app'}/api/auth/callback`
        });

        const response = await fetch(`${this.DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Discord token exchange error:', error);
            throw new Error('Failed to exchange code for token');
        }

        return await response.json();
    }

    static async getUser(accessToken) {
        const response = await fetch(`${this.DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        return await response.json();
    }

    static async getUserGuilds(accessToken) {
        const response = await fetch(`${this.DISCORD_API}/users/@me/guilds`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user guilds');
        }

        return await response.json();
    }

    static async isUserInServer(accessToken) {
        try {
            const guilds = await this.getUserGuilds(accessToken);
            const serverId = process.env.DISCORD_SERVER_ID;
            return guilds.some(guild => guild.id === serverId);
        } catch (error) {
            console.error('Error checking server membership:', error);
            return false;
        }
    }

    // Bot API methods
    static async checkUserInServerViaBot(userId) {
        try {
            const response = await fetch(
                `${this.DISCORD_API}/guilds/${process.env.DISCORD_SERVER_ID}/members/${userId}`,
                {
                    headers: {
                        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
                    }
                }
            );

            return response.ok;
        } catch (error) {
            console.error('Error checking server membership via bot:', error);
            return false;
        }
    }

    static async sendWebhookMessage(message, embedData = null) {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) return;

        const payload = {
            content: message
        };

        if (embedData) {
            payload.embeds = [embedData];
        }

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error('Error sending webhook:', error);
        }
    }

    static async notifyNewUser(user) {
        const embed = {
            title: '🎉 New User Registered',
            color: 0x5865F2,
            fields: [
                { name: 'Username', value: user.discord_username, inline: true },
                { name: 'Discord ID', value: user.discord_id, inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await this.sendWebhookMessage(null, embed);
    }

    static async notifyKeyGenerated(user, key) {
        const embed = {
            title: '🔑 New Key Generated',
            color: 0x57F287,
            fields: [
                { name: 'Username', value: user.discord_username, inline: true },
                { name: 'Key ID', value: key.id.toString(), inline: true },
                { name: 'Expires', value: new Date(key.expires_at).toLocaleString(), inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        await this.sendWebhookMessage(null, embed);
    }
}

module.exports = DiscordAPI;
