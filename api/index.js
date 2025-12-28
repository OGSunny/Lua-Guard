const crypto = require('crypto');

// ============================================
// DATABASE (In-Memory for now - replace with real DB later)
// ============================================
const DATABASE = {
    users: new Map(),
    keys: new Map(),
    sessions: new Map(),
    settings: {
        linkvertise: { publisher_id: '', anti_bypass_token: '', is_active: true },
        lootlabs: { publisher_id: '', api_key: '', is_active: false }
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
    }
    return `LUAGUARD-${segments.join('-')}`;
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getExpiration(hours = 24) {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function formatTimeRemaining(expiresAt) {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-HWID');
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
}

// ============================================
// DISCORD CONFIG
// ============================================
const DISCORD = {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
    BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
    SERVER_ID: process.env.DISCORD_SERVER_ID || '',
    REDIRECT_URI: process.env.BASE_URL ? `${process.env.BASE_URL}/api?route=auth/callback` : 'http://localhost:3000/api?route=auth/callback'
};

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
    setCorsHeaders(res);
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Parse URL and route
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const route = url.searchParams.get('route') || path.replace('/api/', '').replace('/api', '');
    
    // Parse body for POST requests
    let body = {};
    if (req.method === 'POST' && req.body) {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
    
    try {
        // ========== API STATUS ==========
        if (route === '' || route === '/' || route === 'status') {
            return res.status(200).json({
                success: true,
                message: 'Lua Guard API is running!',
                version: '1.0.0',
                endpoints: [
                    'GET  /api - API status',
                    'POST /api?route=keys/validate - Validate a key',
                    'POST /api?route=keys/generate - Generate a key',
                    'GET  /api?route=keys/user - Get user keys',
                    'GET  /api?route=auth/discord - Discord OAuth',
                    'GET  /api?route=auth/me - Get current user',
                    'GET  /api?route=admin/stats - Get statistics',
                    'POST /api?route=admin/settings - Update settings'
                ]
            });
        }
        
        // ========== KEY VALIDATION ==========
        if (route === 'keys/validate') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Method not allowed' });
            }
            
            const { key, hwid } = body;
            
            if (!key || !hwid) {
                return res.status(400).json({
                    success: false,
                    valid: false,
                    error: 'Key and HWID are required'
                });
            }
            
            // Check test key
            if (key === 'TEST-KEY-12345') {
                return res.status(200).json({
                    success: true,
                    valid: true,
                    expires_at: getExpiration(24).toISOString(),
                    time_remaining: '24h 0m',
                    message: 'Test key validated!'
                });
            }
            
            // Check database for key
            const storedKey = DATABASE.keys.get(key);
            
            if (storedKey) {
                // Check expiration
                if (new Date(storedKey.expires_at) < new Date()) {
                    return res.status(200).json({
                        success: false,
                        valid: false,
                        error: 'Key has expired'
                    });
                }
                
                // Check HWID
                if (storedKey.hwid !== hwid) {
                    return res.status(200).json({
                        success: false,
                        valid: false,
                        error: 'HWID mismatch - key bound to different device'
                    });
                }
                
                // Update last used
                storedKey.last_used = new Date().toISOString();
                storedKey.use_count = (storedKey.use_count || 0) + 1;
                
                return res.status(200).json({
                    success: true,
                    valid: true,
                    expires_at: storedKey.expires_at,
                    time_remaining: formatTimeRemaining(storedKey.expires_at)
                });
            }
            
            // Accept any LUAGUARD- format key for demo
            if (key.startsWith('LUAGUARD-') && key.length >= 20) {
                const newKey = {
                    key: key,
                    hwid: hwid,
                    created_at: new Date().toISOString(),
                    expires_at: getExpiration(24).toISOString(),
                    use_count: 1
                };
                DATABASE.keys.set(key, newKey);
                
                return res.status(200).json({
                    success: true,
                    valid: true,
                    expires_at: newKey.expires_at,
                    time_remaining: '24h 0m'
                });
            }
            
            return res.status(200).json({
                success: false,
                valid: false,
                error: 'Invalid key'
            });
        }
        
        // ========== KEY GENERATION ==========
        if (route === 'keys/generate') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Method not allowed' });
            }
            
            const { hwid, discord_id } = body;
            
            if (!hwid) {
                return res.status(400).json({
                    success: false,
                    error: 'HWID is required'
                });
            }
            
            // Check for existing active key for this HWID
            for (const [keyStr, keyData] of DATABASE.keys) {
                if (keyData.hwid === hwid && new Date(keyData.expires_at) > new Date()) {
                    return res.status(200).json({
                        success: true,
                        hasActiveKey: true,
                        key: keyStr,
                        expires_at: keyData.expires_at,
                        time_remaining: formatTimeRemaining(keyData.expires_at)
                    });
                }
            }
            
            // Generate new key
            const newKeyStr = generateKey();
            const expiresAt = getExpiration(24);
            
            const keyData = {
                key: newKeyStr,
                hwid: hwid,
                discord_id: discord_id || null,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                ip_address: getClientIP(req),
                use_count: 0
            };
            
            DATABASE.keys.set(newKeyStr, keyData);
            
            return res.status(200).json({
                success: true,
                key: newKeyStr,
                expires_at: expiresAt.toISOString(),
                time_remaining: '24h 0m'
            });
        }
        
        // ========== GET USER KEYS ==========
        if (route === 'keys/user') {
            const hwid = req.headers['x-hwid'] || url.searchParams.get('hwid');
            
            if (!hwid) {
                return res.status(400).json({
                    success: false,
                    error: 'HWID required'
                });
            }
            
            const userKeys = [];
            for (const [keyStr, keyData] of DATABASE.keys) {
                if (keyData.hwid === hwid) {
                    userKeys.push({
                        key: keyStr,
                        created_at: keyData.created_at,
                        expires_at: keyData.expires_at,
                        is_active: new Date(keyData.expires_at) > new Date(),
                        time_remaining: formatTimeRemaining(keyData.expires_at),
                        use_count: keyData.use_count || 0
                    });
                }
            }
            
            return res.status(200).json({
                success: true,
                keys: userKeys,
                total: userKeys.length
            });
        }
        
        // ========== DISCORD AUTH - REDIRECT ==========
        if (route === 'auth/discord') {
            if (!DISCORD.CLIENT_ID) {
                return res.status(500).json({
                    success: false,
                    error: 'Discord not configured. Set DISCORD_CLIENT_ID in environment variables.'
                });
            }
            
            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD.CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD.REDIRECT_URI)}&response_type=code&scope=identify%20email%20guilds`;
            
            res.setHeader('Location', authUrl);
            return res.status(302).end();
        }
        
        // ========== DISCORD AUTH - CALLBACK ==========
        if (route === 'auth/callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            
            if (error) {
                res.setHeader('Location', '/?error=oauth_denied');
                return res.status(302).end();
            }
            
            if (!code) {
                res.setHeader('Location', '/?error=no_code');
                return res.status(302).end();
            }
            
            try {
                // Exchange code for token
                const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: DISCORD.CLIENT_ID,
                        client_secret: DISCORD.CLIENT_SECRET,
                        grant_type: 'authorization_code',
                        code: code,
                        redirect_uri: DISCORD.REDIRECT_URI
                    })
                });
                
                const tokenData = await tokenRes.json();
                
                if (!tokenData.access_token) {
                    res.setHeader('Location', '/?error=token_failed');
                    return res.status(302).end();
                }
                
                // Get user info
                const userRes = await fetch('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });
                
                const userData = await userRes.json();
                
                // Store user
                const user = {
                    discord_id: userData.id,
                    username: userData.username,
                    avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : null,
                    email: userData.email,
                    joined_at: new Date().toISOString(),
                    is_admin: false,
                    is_banned: false
                };
                
                DATABASE.users.set(userData.id, user);
                
                // Create session
                const sessionToken = generateToken();
                DATABASE.sessions.set(sessionToken, {
                    discord_id: userData.id,
                    expires_at: getExpiration(24 * 7).toISOString()
                });
                
                // Redirect with session
                res.setHeader('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}`);
                res.setHeader('Location', '/dashboard.html');
                return res.status(302).end();
                
            } catch (err) {
                console.error('OAuth error:', err);
                res.setHeader('Location', '/?error=auth_failed');
                return res.status(302).end();
            }
        }
        
        // ========== GET CURRENT USER ==========
        if (route === 'auth/me') {
            const cookies = req.headers.cookie || '';
            const sessionMatch = cookies.match(/session=([^;]+)/);
            const sessionToken = sessionMatch ? sessionMatch[1] : null;
            
            if (!sessionToken) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }
            
            const session = DATABASE.sessions.get(sessionToken);
            
            if (!session || new Date(session.expires_at) < new Date()) {
                return res.status(401).json({ success: false, error: 'Session expired' });
            }
            
            const user = DATABASE.users.get(session.discord_id);
            
            if (!user) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            
            return res.status(200).json({
                success: true,
                user: {
                    discord_id: user.discord_id,
                    username: user.username,
                    avatar: user.avatar,
                    is_admin: user.is_admin,
                    is_banned: user.is_banned
                }
            });
        }
        
        // ========== LOGOUT ==========
        if (route === 'auth/logout') {
            const cookies = req.headers.cookie || '';
            const sessionMatch = cookies.match(/session=([^;]+)/);
            if (sessionMatch) {
                DATABASE.sessions.delete(sessionMatch[1]);
            }
            
            res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
            
            if (req.method === 'GET') {
                res.setHeader('Location', '/');
                return res.status(302).end();
            }
            
            return res.status(200).json({ success: true });
        }
        
        // ========== ADMIN STATS ==========
        if (route === 'admin/stats') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            let activeKeys = 0;
            let todayKeys = 0;
            
            for (const [, keyData] of DATABASE.keys) {
                if (new Date(keyData.expires_at) > now) activeKeys++;
                if (new Date(keyData.created_at) > today) todayKeys++;
            }
            
            return res.status(200).json({
                success: true,
                stats: {
                    totalUsers: DATABASE.users.size,
                    totalKeys: DATABASE.keys.size,
                    activeKeys: activeKeys,
                    todayKeys: todayKeys,
                    bannedUsers: [...DATABASE.users.values()].filter(u => u.is_banned).length
                }
            });
        }
        
        // ========== ADMIN USERS ==========
        if (route === 'admin/users') {
            const users = [...DATABASE.users.values()].map(u => ({
                discord_id: u.discord_id,
                username: u.username,
                avatar: u.avatar,
                joined_at: u.joined_at,
                is_admin: u.is_admin,
                is_banned: u.is_banned
            }));
            
            return res.status(200).json({
                success: true,
                users: users,
                total: users.length
            });
        }
        
        // ========== ADMIN KEYS ==========
        if (route === 'admin/keys') {
            const keys = [...DATABASE.keys.entries()].map(([keyStr, data]) => ({
                key: keyStr,
                hwid: data.hwid ? data.hwid.substring(0, 8) + '...' : 'N/A',
                created_at: data.created_at,
                expires_at: data.expires_at,
                is_active: new Date(data.expires_at) > new Date(),
                use_count: data.use_count || 0
            }));
            
            return res.status(200).json({
                success: true,
                keys: keys,
                total: keys.length
            });
        }
        
        // ========== ADMIN BAN/UNBAN ==========
        if (route === 'admin/ban') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Method not allowed' });
            }
            
            const { discord_id, action } = body;
            
            if (!discord_id || !action) {
                return res.status(400).json({ success: false, error: 'discord_id and action required' });
            }
            
            const user = DATABASE.users.get(discord_id);
            
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            if (action === 'ban') {
                user.is_banned = true;
            } else if (action === 'unban') {
                user.is_banned = false;
            } else if (action === 'admin') {
                user.is_admin = true;
            } else if (action === 'unadmin') {
                user.is_admin = false;
            }
            
            return res.status(200).json({
                success: true,
                message: `User ${action} successful`,
                user: user
            });
        }
        
        // ========== ADMIN SETTINGS ==========
        if (route === 'admin/settings') {
            if (req.method === 'GET') {
                return res.status(200).json({
                    success: true,
                    settings: {
                        linkvertise: {
                            publisher_id: DATABASE.settings.linkvertise.publisher_id,
                            has_token: !!DATABASE.settings.linkvertise.anti_bypass_token,
                            is_active: DATABASE.settings.linkvertise.is_active
                        },
                        lootlabs: {
                            publisher_id: DATABASE.settings.lootlabs.publisher_id,
                            has_key: !!DATABASE.settings.lootlabs.api_key,
                            is_active: DATABASE.settings.lootlabs.is_active
                        }
                    }
                });
            }
            
            if (req.method === 'POST') {
                const { integration_type, publisher_id, anti_bypass_token, api_key, is_active } = body;
                
                if (integration_type === 'linkvertise') {
                    if (publisher_id !== undefined) DATABASE.settings.linkvertise.publisher_id = publisher_id;
                    if (anti_bypass_token !== undefined) DATABASE.settings.linkvertise.anti_bypass_token = anti_bypass_token;
                    if (is_active !== undefined) DATABASE.settings.linkvertise.is_active = is_active;
                } else if (integration_type === 'lootlabs') {
                    if (publisher_id !== undefined) DATABASE.settings.lootlabs.publisher_id = publisher_id;
                    if (api_key !== undefined) DATABASE.settings.lootlabs.api_key = api_key;
                    if (is_active !== undefined) DATABASE.settings.lootlabs.is_active = is_active;
                }
                
                return res.status(200).json({
                    success: true,
                    message: 'Settings updated'
                });
            }
        }
        
        // ========== LINKVERTISE CALLBACK ==========
        if (route === 'linkvertise/callback') {
            const requestId = url.searchParams.get('r');
            const hwid = url.searchParams.get('hwid');
            
            if (!requestId || !hwid) {
                res.setHeader('Location', '/?error=invalid_callback');
                return res.status(302).end();
            }
            
            // Generate key
            const newKeyStr = generateKey();
            const expiresAt = getExpiration(24);
            
            DATABASE.keys.set(newKeyStr, {
                key: newKeyStr,
                hwid: hwid,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                use_count: 0
            });
            
            res.setHeader('Location', `/dashboard.html?key=${encodeURIComponent(newKeyStr)}&success=true`);
            return res.status(302).end();
        }
        
        // ========== 404 NOT FOUND ==========
        return res.status(404).json({
            success: false,
            error: 'Endpoint not found',
            route: route,
            availableRoutes: [
                'keys/validate',
                'keys/generate',
                'keys/user',
                'auth/discord',
                'auth/me',
                'auth/logout',
                'admin/stats',
                'admin/users',
                'admin/keys',
                'admin/settings'
            ]
        });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};
