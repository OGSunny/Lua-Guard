const crypto = require('crypto');

// ============================================
// DATABASE (In-Memory)
// ============================================
const DB = {
    keys: new Map(),
    checkpoints: new Map(),
    users: new Map(),
    hwids: new Map()
};

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    LINKVERTISE_ID: process.env.LINKVERTISE_PUBLISHER_ID || '',
    KEY_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    CHECKPOINTS_REQUIRED: 2,
    BASE_URL: process.env.BASE_URL || 'https://lua-guard-test.vercel.app'
};

// ============================================
// HELPERS
// ============================================
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'LUAGUARD-';
    for (let i = 0; i < 4; i++) {
        if (i > 0) key += '-';
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    return key;
}

function generateCheckpointId() {
    return crypto.randomBytes(16).toString('hex');
}

function getHwidData(hwid) {
    if (!DB.hwids.has(hwid)) {
        DB.hwids.set(hwid, {
            hwid: hwid,
            checkpoints: 0,
            checkpoint_id: null,
            key: null,
            key_expires: null,
            created: Date.now()
        });
    }
    return DB.hwids.get(hwid);
}

function createLinkvertiseUrl(targetUrl) {
    const linkvertiseId = CONFIG.LINKVERTISE_ID;
    if (!linkvertiseId) {
        return targetUrl;
    }
    // Dynamic Linkvertise link
    const encoded = Buffer.from(targetUrl).toString('base64');
    return `https://link-to.net/${linkvertiseId}/dynamic?r=${encoded}`;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-HWID');
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
    setCors(res);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = url.searchParams.get('route') || url.pathname.replace('/api/', '').replace('/api', '') || '';
    
    let body = {};
    if (req.body) {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
    
    try {
        // ==================== API STATUS ====================
        if (route === '' || route === '/') {
            return res.status(200).json({
                success: true,
                name: 'Lua Guard API',
                version: '2.0.0',
                status: 'online'
            });
        }

        // ==================== GET KEY PAGE INFO ====================
        if (route === 'getkey' || route === 'key/info') {
            const hwid = url.searchParams.get('hwid') || body.hwid || req.headers['x-hwid'];
            
            if (!hwid) {
                return res.status(400).json({ success: false, error: 'HWID required' });
            }
            
            const data = getHwidData(hwid);
            
            // Check if already has valid key
            if (data.key && data.key_expires > Date.now()) {
                return res.status(200).json({
                    success: true,
                    has_key: true,
                    key: data.key,
                    expires_in: Math.floor((data.key_expires - Date.now()) / 1000),
                    expires_at: new Date(data.key_expires).toISOString()
                });
            }
            
            // Generate checkpoint ID if not exists
            if (!data.checkpoint_id) {
                data.checkpoint_id = generateCheckpointId();
                data.checkpoints = 0;
            }
            
            return res.status(200).json({
                success: true,
                has_key: false,
                checkpoints_completed: data.checkpoints,
                checkpoints_required: CONFIG.CHECKPOINTS_REQUIRED,
                checkpoint_id: data.checkpoint_id,
                hwid: hwid
            });
        }

        // ==================== GET CHECKPOINT LINK ====================
        if (route === 'checkpoint' || route === 'key/checkpoint') {
            const hwid = url.searchParams.get('hwid') || body.hwid;
            const checkpoint = parseInt(url.searchParams.get('checkpoint') || body.checkpoint || '1');
            
            if (!hwid) {
                return res.status(400).json({ success: false, error: 'HWID required' });
            }
            
            const data = getHwidData(hwid);
            
            // Check if already has valid key
            if (data.key && data.key_expires > Date.now()) {
                return res.status(200).json({
                    success: true,
                    has_key: true,
                    key: data.key,
                    message: 'You already have a valid key!'
                });
            }
            
            // Generate checkpoint ID if not exists
            if (!data.checkpoint_id) {
                data.checkpoint_id = generateCheckpointId();
            }
            
            // Create callback URL for this checkpoint
            const callbackUrl = `${CONFIG.BASE_URL}/api?route=checkpoint/complete&hwid=${hwid}&cp=${checkpoint}&token=${data.checkpoint_id}`;
            
            // Create Linkvertise URL
            const linkvertiseUrl = createLinkvertiseUrl(callbackUrl);
            
            return res.status(200).json({
                success: true,
                checkpoint: checkpoint,
                total_checkpoints: CONFIG.CHECKPOINTS_REQUIRED,
                url: linkvertiseUrl,
                callback: callbackUrl
            });
        }

        // ==================== CHECKPOINT COMPLETE (CALLBACK) ====================
        if (route === 'checkpoint/complete') {
            const hwid = url.searchParams.get('hwid');
            const checkpoint = parseInt(url.searchParams.get('cp') || '1');
            const token = url.searchParams.get('token');
            
            if (!hwid || !token) {
                res.setHeader('Location', `${CONFIG.BASE_URL}/getkey.html?error=invalid`);
                return res.status(302).end();
            }
            
            const data = getHwidData(hwid);
            
            // Verify token
            if (data.checkpoint_id !== token) {
                res.setHeader('Location', `${CONFIG.BASE_URL}/getkey.html?hwid=${hwid}&error=invalid_token`);
                return res.status(302).end();
            }
            
            // Update checkpoint count
            if (checkpoint > data.checkpoints) {
                data.checkpoints = checkpoint;
            }
            
            // Check if all checkpoints complete
            if (data.checkpoints >= CONFIG.CHECKPOINTS_REQUIRED) {
                // Generate key!
                const newKey = generateKey();
                const expiresAt = Date.now() + CONFIG.KEY_DURATION;
                
                data.key = newKey;
                data.key_expires = expiresAt;
                data.checkpoint_id = null;
                data.checkpoints = 0;
                
                // Store key in keys DB too
                DB.keys.set(newKey, {
                    key: newKey,
                    hwid: hwid,
                    created: Date.now(),
                    expires: expiresAt
                });
                
                // Redirect to success page
                res.setHeader('Location', `${CONFIG.BASE_URL}/getkey.html?hwid=${hwid}&key=${newKey}&success=true`);
                return res.status(302).end();
            }
            
            // Redirect back to get next checkpoint
            res.setHeader('Location', `${CONFIG.BASE_URL}/getkey.html?hwid=${hwid}&cp=${data.checkpoints}`);
            return res.status(302).end();
        }

        // ==================== VALIDATE KEY ====================
        if (route === 'validate' || route === 'key/validate') {
            const key = body.key || url.searchParams.get('key');
            const hwid = body.hwid || url.searchParams.get('hwid') || req.headers['x-hwid'];
            
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
                    message: 'Test key validated!',
                    expires_in: 86400
                });
            }
            
            // Check HWID data
            const data = getHwidData(hwid);
            
            if (data.key === key && data.key_expires > Date.now()) {
                return res.status(200).json({
                    success: true,
                    valid: true,
                    expires_in: Math.floor((data.key_expires - Date.now()) / 1000),
                    expires_at: new Date(data.key_expires).toISOString()
                });
            }
            
            // Check keys DB
            const keyData = DB.keys.get(key);
            
            if (keyData) {
                if (keyData.hwid !== hwid) {
                    return res.status(200).json({
                        success: false,
                        valid: false,
                        error: 'Key is bound to a different device'
                    });
                }
                
                if (keyData.expires < Date.now()) {
                    return res.status(200).json({
                        success: false,
                        valid: false,
                        error: 'Key has expired'
                    });
                }
                
                return res.status(200).json({
                    success: true,
                    valid: true,
                    expires_in: Math.floor((keyData.expires - Date.now()) / 1000)
                });
            }
            
            return res.status(200).json({
                success: false,
                valid: false,
                error: 'Invalid key'
            });
        }

        // ==================== REDEEM KEY (Manual Entry) ====================
        if (route === 'redeem' || route === 'key/redeem') {
            const key = body.key || url.searchParams.get('key');
            const hwid = body.hwid || url.searchParams.get('hwid');
            
            if (!key || !hwid) {
                return res.status(400).json({
                    success: false,
                    error: 'Key and HWID required'
                });
            }
            
            const keyData = DB.keys.get(key);
            
            if (!keyData) {
                return res.status(200).json({
                    success: false,
                    error: 'Invalid key'
                });
            }
            
            if (keyData.hwid && keyData.hwid !== hwid) {
                return res.status(200).json({
                    success: false,
                    error: 'Key is already bound to another device'
                });
            }
            
            if (keyData.expires < Date.now()) {
                return res.status(200).json({
                    success: false,
                    error: 'Key has expired'
                });
            }
            
            // Bind to HWID if not already
            if (!keyData.hwid) {
                keyData.hwid = hwid;
            }
            
            // Update HWID data
            const data = getHwidData(hwid);
            data.key = key;
            data.key_expires = keyData.expires;
            
            return res.status(200).json({
                success: true,
                message: 'Key redeemed successfully!',
                expires_in: Math.floor((keyData.expires - Date.now()) / 1000)
            });
        }

        // ==================== ADMIN: SET LINKVERTISE ID ====================
        if (route === 'admin/linkvertise') {
            if (req.method !== 'POST') {
                return res.status(200).json({
                    success: true,
                    publisher_id: CONFIG.LINKVERTISE_ID || 'Not set',
                    message: 'Set LINKVERTISE_PUBLISHER_ID in Vercel environment variables'
                });
            }
            
            return res.status(200).json({
                success: true,
                message: 'Set LINKVERTISE_PUBLISHER_ID in Vercel environment variables'
            });
        }

        // ==================== ADMIN: STATS ====================
        if (route === 'admin/stats') {
            return res.status(200).json({
                success: true,
                stats: {
                    total_keys: DB.keys.size,
                    total_hwids: DB.hwids.size,
                    active_keys: [...DB.keys.values()].filter(k => k.expires > Date.now()).length,
                    linkvertise_configured: !!CONFIG.LINKVERTISE_ID
                }
            });
        }

        // ==================== ADMIN: CREATE KEY ====================
        if (route === 'admin/createkey') {
            const hwid = body.hwid || url.searchParams.get('hwid');
            const duration = parseInt(body.duration || url.searchParams.get('duration') || '24');
            
            const newKey = generateKey();
            const expiresAt = Date.now() + (duration * 60 * 60 * 1000);
            
            DB.keys.set(newKey, {
                key: newKey,
                hwid: hwid || null,
                created: Date.now(),
                expires: expiresAt
            });
            
            if (hwid) {
                const data = getHwidData(hwid);
                data.key = newKey;
                data.key_expires = expiresAt;
            }
            
            return res.status(200).json({
                success: true,
                key: newKey,
                expires_in: duration * 3600,
                hwid: hwid || 'Not bound'
            });
        }

        // ==================== 404 ====================
        return res.status(404).json({
            success: false,
            error: 'Route not found',
            available_routes: [
                'GET /api - Status',
                'GET /api?route=getkey&hwid=XXX - Get key info',
                'GET /api?route=checkpoint&hwid=XXX&checkpoint=1 - Get checkpoint link',
                'POST /api?route=validate - Validate key',
                'GET /api?route=admin/stats - Stats'
            ]
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            message: error.message
        });
    }
};
