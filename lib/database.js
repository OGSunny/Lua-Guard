const { sql } = require('@vercel/postgres');

class Database {
    // User Operations
    static async createUser(discordId, username, avatar, email) {
        try {
            const result = await sql`
                INSERT INTO users (discord_id, discord_username, discord_avatar, discord_email, last_login)
                VALUES (${discordId}, ${username}, ${avatar}, ${email}, CURRENT_TIMESTAMP)
                ON CONFLICT (discord_id) 
                DO UPDATE SET 
                    discord_username = ${username},
                    discord_avatar = ${avatar},
                    last_login = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error creating user:', error);
            throw error;
        }
    }

    static async getUser(discordId) {
        try {
            const result = await sql`
                SELECT * FROM users WHERE discord_id = ${discordId}
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting user:', error);
            throw error;
        }
    }

    static async getAllUsers(limit = 100, offset = 0) {
        try {
            const result = await sql`
                SELECT * FROM users 
                ORDER BY created_at DESC 
                LIMIT ${limit} OFFSET ${offset}
            `;
            return result.rows;
        } catch (error) {
            console.error('Database error getting all users:', error);
            throw error;
        }
    }

    static async banUser(discordId, reason = null) {
        try {
            const result = await sql`
                UPDATE users 
                SET is_banned = true, ban_reason = ${reason}, updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ${discordId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error banning user:', error);
            throw error;
        }
    }

    static async unbanUser(discordId) {
        try {
            const result = await sql`
                UPDATE users 
                SET is_banned = false, ban_reason = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ${discordId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error unbanning user:', error);
            throw error;
        }
    }

    static async setAdmin(discordId, isAdmin) {
        try {
            const result = await sql`
                UPDATE users 
                SET is_admin = ${isAdmin}, updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ${discordId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error setting admin:', error);
            throw error;
        }
    }

    static async setWhitelisted(discordId, isWhitelisted) {
        try {
            const result = await sql`
                UPDATE users 
                SET is_whitelisted = ${isWhitelisted}, updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ${discordId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error setting whitelist:', error);
            throw error;
        }
    }

    // Key Operations
    static async createKey(keyString, discordId, hwid, expiresAt, ipAddress = null, scriptName = 'default') {
        try {
            const result = await sql`
                INSERT INTO keys (key_string, discord_id, hwid, expires_at, ip_address, script_name)
                VALUES (${keyString}, ${discordId}, ${hwid}, ${expiresAt}, ${ipAddress}, ${scriptName})
                RETURNING *
            `;

            // Update user's total keys generated
            await sql`
                UPDATE users 
                SET total_keys_generated = total_keys_generated + 1, updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ${discordId}
            `;

            return result.rows[0];
        } catch (error) {
            console.error('Database error creating key:', error);
            throw error;
        }
    }

    static async getKey(keyString) {
        try {
            const result = await sql`
                SELECT k.*, u.discord_username, u.is_banned as user_banned, u.is_whitelisted
                FROM keys k
                LEFT JOIN users u ON k.discord_id = u.discord_id
                WHERE k.key_string = ${keyString}
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting key:', error);
            throw error;
        }
    }

    static async validateKey(keyString, hwid) {
        try {
            const key = await this.getKey(keyString);
            
            if (!key) {
                return { valid: false, error: 'Key not found' };
            }

            if (key.user_banned) {
                return { valid: false, error: 'User is banned' };
            }

            if (!key.is_active) {
                return { valid: false, error: 'Key is deactivated' };
            }

            if (new Date(key.expires_at) < new Date()) {
                return { valid: false, error: 'Key has expired' };
            }

            if (key.hwid !== hwid) {
                return { valid: false, error: 'HWID mismatch' };
            }

            // Update last validated
            await sql`
                UPDATE keys 
                SET last_validated = CURRENT_TIMESTAMP, validation_count = validation_count + 1, is_used = true
                WHERE key_string = ${keyString}
            `;

            return { 
                valid: true, 
                key: key,
                expires_at: key.expires_at,
                is_whitelisted: key.is_whitelisted
            };
        } catch (error) {
            console.error('Database error validating key:', error);
            throw error;
        }
    }

    static async getUserKeys(discordId) {
        try {
            const result = await sql`
                SELECT * FROM keys 
                WHERE discord_id = ${discordId}
                ORDER BY created_at DESC
            `;
            return result.rows;
        } catch (error) {
            console.error('Database error getting user keys:', error);
            throw error;
        }
    }

    static async getActiveUserKey(discordId, hwid) {
        try {
            const result = await sql`
                SELECT * FROM keys 
                WHERE discord_id = ${discordId} 
                AND hwid = ${hwid}
                AND is_active = true
                AND expires_at > CURRENT_TIMESTAMP
                ORDER BY created_at DESC
                LIMIT 1
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting active user key:', error);
            throw error;
        }
    }

    static async getAllKeys(limit = 100, offset = 0) {
        try {
            const result = await sql`
                SELECT k.*, u.discord_username 
                FROM keys k
                LEFT JOIN users u ON k.discord_id = u.discord_id
                ORDER BY k.created_at DESC 
                LIMIT ${limit} OFFSET ${offset}
            `;
            return result.rows;
        } catch (error) {
            console.error('Database error getting all keys:', error);
            throw error;
        }
    }

    static async deactivateKey(keyId) {
        try {
            const result = await sql`
                UPDATE keys 
                SET is_active = false
                WHERE id = ${keyId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error deactivating key:', error);
            throw error;
        }
    }

    // Pending Keys Operations
    static async createPendingKey(requestId, discordId, hwid, expiresAt, ipAddress = null) {
        try {
            const result = await sql`
                INSERT INTO pending_keys (request_id, discord_id, hwid, expires_at, ip_address)
                VALUES (${requestId}, ${discordId}, ${hwid}, ${expiresAt}, ${ipAddress})
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error creating pending key:', error);
            throw error;
        }
    }

    static async getPendingKey(requestId) {
        try {
            const result = await sql`
                SELECT * FROM pending_keys 
                WHERE request_id = ${requestId} 
                AND is_completed = false
                AND expires_at > CURRENT_TIMESTAMP
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting pending key:', error);
            throw error;
        }
    }

    static async completePendingKey(requestId) {
        try {
            const result = await sql`
                UPDATE pending_keys 
                SET is_completed = true
                WHERE request_id = ${requestId}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error completing pending key:', error);
            throw error;
        }
    }

    // Integration Settings Operations
    static async getIntegrationSettings(type = 'linkvertise') {
        try {
            const result = await sql`
                SELECT * FROM integration_settings 
                WHERE integration_type = ${type}
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting integration settings:', error);
            throw error;
        }
    }

    static async updateIntegrationSettings(type, publisherId, antiBypassToken, apiKey = null, webhookUrl = null) {
        try {
            const result = await sql`
                UPDATE integration_settings 
                SET publisher_id = ${publisherId}, 
                    anti_bypass_token = ${antiBypassToken},
                    api_key = ${apiKey},
                    webhook_url = ${webhookUrl},
                    updated_at = CURRENT_TIMESTAMP
                WHERE integration_type = ${type}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error updating integration settings:', error);
            throw error;
        }
    }

    static async setIntegrationActive(type, isActive) {
        try {
            const result = await sql`
                UPDATE integration_settings 
                SET is_active = ${isActive}, updated_at = CURRENT_TIMESTAMP
                WHERE integration_type = ${type}
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error setting integration active:', error);
            throw error;
        }
    }

    // HWID Bindings Operations
    static async bindHWID(discordId, hwid) {
        try {
            const result = await sql`
                INSERT INTO hwid_bindings (discord_id, hwid)
                VALUES (${discordId}, ${hwid})
                ON CONFLICT (discord_id, hwid) 
                DO UPDATE SET last_seen = CURRENT_TIMESTAMP
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error binding HWID:', error);
            throw error;
        }
    }

    static async getHWIDBindings(discordId) {
        try {
            const result = await sql`
                SELECT * FROM hwid_bindings 
                WHERE discord_id = ${discordId}
            `;
            return result.rows;
        } catch (error) {
            console.error('Database error getting HWID bindings:', error);
            throw error;
        }
    }

    static async banHWID(hwid) {
        try {
            const result = await sql`
                UPDATE hwid_bindings 
                SET is_banned = true
                WHERE hwid = ${hwid}
                RETURNING *
            `;
            return result.rows;
        } catch (error) {
            console.error('Database error banning HWID:', error);
            throw error;
        }
    }

    static async isHWIDBanned(hwid) {
        try {
            const result = await sql`
                SELECT * FROM hwid_bindings 
                WHERE hwid = ${hwid} AND is_banned = true
                LIMIT 1
            `;
            return result.rows.length > 0;
        } catch (error) {
            console.error('Database error checking HWID ban:', error);
            throw error;
        }
    }

    // Session Operations
    static async createSession(sessionToken, discordId, expiresAt) {
        try {
            const result = await sql`
                INSERT INTO sessions (session_token, discord_id, expires_at)
                VALUES (${sessionToken}, ${discordId}, ${expiresAt})
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error creating session:', error);
            throw error;
        }
    }

    static async getSession(sessionToken) {
        try {
            const result = await sql`
                SELECT s.*, u.* 
                FROM sessions s
                JOIN users u ON s.discord_id = u.discord_id
                WHERE s.session_token = ${sessionToken}
                AND s.expires_at > CURRENT_TIMESTAMP
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error getting session:', error);
            throw error;
        }
    }

    static async deleteSession(sessionToken) {
        try {
            await sql`
                DELETE FROM sessions 
                WHERE session_token = ${sessionToken}
            `;
            return true;
        } catch (error) {
            console.error('Database error deleting session:', error);
            throw error;
        }
    }

    // Analytics Operations
    static async logEvent(eventType, discordId = null, hwid = null, ipAddress = null, userAgent = null, metadata = null) {
        try {
            const result = await sql`
                INSERT INTO analytics (event_type, discord_id, hwid, ip_address, user_agent, metadata)
                VALUES (${eventType}, ${discordId}, ${hwid}, ${ipAddress}, ${userAgent}, ${JSON.stringify(metadata)})
                RETURNING *
            `;
            return result.rows[0];
        } catch (error) {
            console.error('Database error logging event:', error);
            // Don't throw for analytics errors
        }
    }

    static async getStats() {
        try {
            const totalUsers = await sql`SELECT COUNT(*) as count FROM users`;
            const totalKeys = await sql`SELECT COUNT(*) as count FROM keys`;
            const activeKeys = await sql`
                SELECT COUNT(*) as count FROM keys 
                WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP
            `;
            const todayKeys = await sql`
                SELECT COUNT(*) as count FROM keys 
                WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
            `;
            const bannedUsers = await sql`SELECT COUNT(*) as count FROM users WHERE is_banned = true`;

            return {
                totalUsers: parseInt(totalUsers.rows[0].count),
                totalKeys: parseInt(totalKeys.rows[0].count),
                activeKeys: parseInt(activeKeys.rows[0].count),
                todayKeys: parseInt(todayKeys.rows[0].count),
                bannedUsers: parseInt(bannedUsers.rows[0].count)
            };
        } catch (error) {
            console.error('Database error getting stats:', error);
            throw error;
        }
    }
}

module.exports = Database;
