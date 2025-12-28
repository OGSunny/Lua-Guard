const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class Security {
    static generateKey() {
        // Generate a unique key in format: LUAGUARD-XXXX-XXXX-XXXX-XXXX
        const segments = [];
        for (let i = 0; i < 4; i++) {
            segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
        }
        return `LUAGUARD-${segments.join('-')}`;
    }

    static generateRequestId() {
        return crypto.randomBytes(16).toString('hex');
    }

    static generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static hashHWID(hwid) {
        return crypto.createHash('sha256').update(hwid).digest('hex');
    }

    static encryptKey(key) {
        const algorithm = 'aes-256-gcm';
        const secretKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey.slice(0, 32).padEnd(32, '0')), iv);
        let encrypted = cipher.update(key, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }

    static decryptKey(encryptedKey) {
        try {
            const algorithm = 'aes-256-gcm';
            const secretKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
            const [ivHex, authTagHex, encrypted] = encryptedKey.split(':');
            
            const decipher = crypto.createDecipheriv(
                algorithm, 
                Buffer.from(secretKey.slice(0, 32).padEnd(32, '0')), 
                Buffer.from(ivHex, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    static createJWT(payload, expiresIn = '24h') {
        return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
    }

    static verifyJWT(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    static generateSignature(data, secret) {
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(data))
            .digest('hex');
    }

    static verifySignature(data, signature, secret) {
        const expectedSignature = this.generateSignature(data, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    static validateHWID(hwid) {
        // HWID should be a valid format (executor-dependent)
        if (!hwid || typeof hwid !== 'string') return false;
        if (hwid.length < 10 || hwid.length > 128) return false;
        
        // Check for common spoofed/invalid HWIDs
        const invalidHWIDs = ['unknown', 'none', 'null', 'undefined', '0', ''];
        if (invalidHWIDs.includes(hwid.toLowerCase())) return false;
        
        return true;
    }

    static rateLimit(identifier, maxRequests = 10, windowMs = 60000) {
        // Simple in-memory rate limiting (use Redis in production)
        if (!global.rateLimitStore) {
            global.rateLimitStore = new Map();
        }

        const now = Date.now();
        const key = identifier;
        const record = global.rateLimitStore.get(key);

        if (!record) {
            global.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return { allowed: true, remaining: maxRequests - 1 };
        }

        if (now > record.resetTime) {
            global.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return { allowed: true, remaining: maxRequests - 1 };
        }

        if (record.count >= maxRequests) {
            return { allowed: false, remaining: 0, retryAfter: record.resetTime - now };
        }

        record.count++;
        return { allowed: true, remaining: maxRequests - record.count };
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove potential XSS
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    static getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
            || req.headers['x-real-ip'] 
            || req.connection?.remoteAddress 
            || 'unknown';
    }

    static async checkVPN(ip) {
        // Basic VPN/Proxy detection
        // In production, use a proper VPN detection service
        try {
            const response = await fetch(`https://vpnapi.io/api/${ip}?key=${process.env.VPN_API_KEY}`);
            if (response.ok) {
                const data = await response.json();
                return data.security?.vpn || data.security?.proxy || data.security?.tor;
            }
        } catch (error) {
            console.error('VPN check error:', error);
        }
        return false;
    }
}

module.exports = Security;
