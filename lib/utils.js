const cookie = require('cookie');

class Utils {
    static parseBody(req) {
        return new Promise((resolve, reject) => {
            if (req.body) {
                resolve(req.body);
                return;
            }

            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body || '{}'));
                } catch (e) {
                    resolve({});
                }
            });
            req.on('error', reject);
        });
    }

    static parseCookies(req) {
        return cookie.parse(req.headers.cookie || '');
    }

    static setCookie(res, name, value, options = {}) {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 86400 * 7, // 7 days
            ...options
        };

        res.setHeader('Set-Cookie', cookie.serialize(name, value, cookieOptions));
    }

    static clearCookie(res, name) {
        res.setHeader('Set-Cookie', cookie.serialize(name, '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0
        }));
    }

    static sendJSON(res, data, status = 200) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    static sendError(res, message, status = 400) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: message }));
    }

    static redirect(res, url) {
        res.writeHead(302, { Location: url });
        res.end();
    }

    static getExpirationDate(hours = 24) {
        return new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    static formatTimeRemaining(expiresAt) {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires - now;

        if (diff <= 0) return 'Expired';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Utils;
