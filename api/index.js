const crypto = require('crypto');

// ============================================
// DATABASE
// ============================================
const DB = {
    keys: new Map(),
    hwids: new Map(),
    users: new Map(),
    sessions: new Map(),
    config: {
        linkvertise_id: process.env.LINKVERTISE_PUBLISHER_ID || '',
        discord_webhook: process.env.DISCORD_WEBHOOK_URL || '',
        key_duration: 24,
        checkpoints: 2,
        site_name: 'Lua Guard'
    }
};

// Pre-add some demo data
DB.keys.set('TEST-KEY-12345', {
    key: 'TEST-KEY-12345',
    hwid: null,
    note: 'Test Key',
    created: Date.now(),
    expires: Date.now() + (365 * 24 * 60 * 60 * 1000),
    uses: 0
});

// ============================================
// HELPERS
// ============================================
const generateKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = 'LG-';
    for (let i = 0; i < 3; i++) {
        if (i > 0) key += '-';
        for (let j = 0; j < 4; j++) {
            key += chars[Math.floor(Math.random() * chars.length)];
        }
    }
    return key;
};

const generateId = () => crypto.randomBytes(16).toString('hex');

const formatDuration = (ms) => {
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
};

const getHwid = (hwid) => {
    if (!DB.hwids.has(hwid)) {
        DB.hwids.set(hwid, {
            hwid,
            checkpoints: [],
            checkpoint_token: generateId(),
            key: null,
            expires: null,
            ip: null,
            created: Date.now(),
            last_seen: Date.now()
        });
    }
    const data = DB.hwids.get(hwid);
    data.last_seen = Date.now();
    return data;
};

const getLinkvertiseUrl = (target) => {
    const id = DB.config.linkvertise_id;
    if (!id) return target;
    const encoded = Buffer.from(target).toString('base64url');
    return `https://link-to.net/${id}/dynamic?r=${encoded}`;
};

const sendWebhook = async (embed) => {
    if (!DB.config.discord_webhook) return;
    try {
        await fetch(DB.config.discord_webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (e) {}
};

const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-HWID');
};

const BASE = process.env.BASE_URL || 'https://lua-guard-test.vercel.app';

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace('/api', '').replace(/^\/+|\/+$/g, '');
    const route = url.searchParams.get('route') || path;
    const query = Object.fromEntries(url.searchParams);
    
    let body = {};
    try {
        if (req.body) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {}

    const json = (data, status = 200) => res.status(status).json(data);
    const redirect = (url) => { res.setHeader('Location', url); return res.status(302).end(); };

    // ==================== ROUTES ====================
    
    // Status
    if (!route || route === 'status') {
        return json({
            success: true,
            name: 'Lua Guard API',
            version: '3.0.0',
            status: 'operational'
        });
    }

    // ==================== KEY SYSTEM ====================

    // Get Key Info
    if (route === 'key/info' || route === 'getkey') {
        const hwid = query.hwid || body.hwid || req.headers['x-hwid'];
        if (!hwid) return json({ success: false, error: 'HWID required' }, 400);

        const data = getHwid(hwid);
        
        // Check existing key
        if (data.key && data.expires > Date.now()) {
            return json({
                success: true,
                status: 'active',
                key: data.key,
                expires: data.expires,
                expires_in: formatDuration(data.expires - Date.now())
            });
        }

        // Need checkpoints
        const completed = data.checkpoints.length;
        const required = DB.config.checkpoints;

        return json({
            success: true,
            status: 'pending',
            checkpoints_completed: completed,
            checkpoints_required: required,
            token: data.checkpoint_token
        });
    }

    // Get Checkpoint URL
    if (route === 'key/checkpoint') {
        const hwid = query.hwid || body.hwid;
        const step = parseInt(query.step || body.step || '1');
        
        if (!hwid) return json({ success: false, error: 'HWID required' }, 400);

        const data = getHwid(hwid);
        
        // Already has key?
        if (data.key && data.expires > Date.now()) {
            return json({ success: true, status: 'active', key: data.key });
        }

        const callback = `${BASE}/api?route=key/verify&hwid=${hwid}&step=${step}&t=${data.checkpoint_token}`;
        const linkUrl = getLinkvertiseUrl(callback);

        return json({
            success: true,
            step: step,
            total: DB.config.checkpoints,
            url: linkUrl
        });
    }

    // Verify Checkpoint (callback from Linkvertise)
    if (route === 'key/verify') {
        const { hwid, step, t } = query;
        
        if (!hwid || !t) return redirect(`${BASE}/get-key?error=invalid`);

        const data = getHwid(hwid);
        
        // Verify token
        if (data.checkpoint_token !== t) {
            return redirect(`${BASE}/get-key?hwid=${hwid}&error=token`);
        }

        // Add checkpoint
        const stepNum = parseInt(step || '1');
        if (!data.checkpoints.includes(stepNum)) {
            data.checkpoints.push(stepNum);
        }

        // Check if complete
        if (data.checkpoints.length >= DB.config.checkpoints) {
            // Generate key!
            const key = generateKey();
            const expires = Date.now() + (DB.config.key_duration * 60 * 60 * 1000);

            data.key = key;
            data.expires = expires;
            data.checkpoints = [];
            data.checkpoint_token = generateId();

            DB.keys.set(key, {
                key,
                hwid,
                created: Date.now(),
                expires,
                uses: 0,
                note: 'Auto-generated'
            });

            // Webhook
            sendWebhook({
                title: '🔑 New Key Generated',
                color: 0x57F287,
                fields: [
                    { name: 'Key', value: `\`${key}\``, inline: true },
                    { name: 'HWID', value: `\`${hwid.slice(0, 12)}...\``, inline: true },
                    { name: 'Expires', value: formatDuration(expires - Date.now()), inline: true }
                ],
                timestamp: new Date().toISOString()
            });

            return redirect(`${BASE}/get-key?hwid=${hwid}&key=${key}&success=1`);
        }

        return redirect(`${BASE}/get-key?hwid=${hwid}&step=${data.checkpoints.length}`);
    }

    // Validate Key
    if (route === 'key/validate' || route === 'validate') {
        const key = query.key || body.key;
        const hwid = query.hwid || body.hwid || req.headers['x-hwid'];

        if (!key) return json({ success: false, error: 'Key required' }, 400);
        if (!hwid) return json({ success: false, error: 'HWID required' }, 400);

        const keyData = DB.keys.get(key);

        if (!keyData) {
            return json({ success: false, valid: false, error: 'Invalid key' });
        }

        if (keyData.expires < Date.now()) {
            return json({ success: false, valid: false, error: 'Key expired' });
        }

        if (keyData.hwid && keyData.hwid !== hwid) {
            return json({ success: false, valid: false, error: 'Key bound to another device' });
        }

        // Bind if not bound
        if (!keyData.hwid) {
            keyData.hwid = hwid;
            const hwidData = getHwid(hwid);
            hwidData.key = key;
            hwidData.expires = keyData.expires;
        }

        keyData.uses++;
        keyData.last_used = Date.now();

        return json({
            success: true,
            valid: true,
            expires_in: formatDuration(keyData.expires - Date.now()),
            expires: keyData.expires
        });
    }

    // Redeem Key
    if (route === 'key/redeem') {
        const key = query.key || body.key;
        const hwid = query.hwid || body.hwid;

        if (!key || !hwid) return json({ success: false, error: 'Key and HWID required' }, 400);

        const keyData = DB.keys.get(key);
        if (!keyData) return json({ success: false, error: 'Invalid key' });
        if (keyData.expires < Date.now()) return json({ success: false, error: 'Key expired' });
        if (keyData.hwid && keyData.hwid !== hwid) return json({ success: false, error: 'Key bound to another device' });

        keyData.hwid = hwid;
        const hwidData = getHwid(hwid);
        hwidData.key = key;
        hwidData.expires = keyData.expires;

        return json({
            success: true,
            message: 'Key redeemed!',
            expires_in: formatDuration(keyData.expires - Date.now())
        });
    }

    // ==================== ADMIN ====================

    // Stats
    if (route === 'admin/stats') {
        const now = Date.now();
        const keys = [...DB.keys.values()];
        const hwids = [...DB.hwids.values()];

        return json({
            success: true,
            stats: {
                total_keys: keys.length,
                active_keys: keys.filter(k => k.expires > now).length,
                expired_keys: keys.filter(k => k.expires <= now).length,
                total_hwids: hwids.length,
                active_hwids: hwids.filter(h => h.expires && h.expires > now).length,
                keys_today: keys.filter(k => k.created > now - 86400000).length,
                total_validations: keys.reduce((a, k) => a + (k.uses || 0), 0)
            },
            config: {
                linkvertise_configured: !!DB.config.linkvertise_id,
                webhook_configured: !!DB.config.discord_webhook,
                key_duration: DB.config.key_duration,
                checkpoints: DB.config.checkpoints
            }
        });
    }

    // Get All Keys
    if (route === 'admin/keys') {
        const keys = [...DB.keys.values()].map(k => ({
            ...k,
            hwid: k.hwid ? k.hwid.slice(0, 12) + '...' : null,
            status: k.expires > Date.now() ? 'active' : 'expired',
            expires_in: formatDuration(k.expires - Date.now())
        })).sort((a, b) => b.created - a.created);

        return json({ success: true, keys, total: keys.length });
    }

    // Create Key
    if (route === 'admin/keys/create') {
        if (req.method !== 'POST') return json({ success: false, error: 'POST required' }, 405);

        const duration = parseInt(body.duration || 24);
        const amount = Math.min(parseInt(body.amount || 1), 50);
        const hwid = body.hwid || null;
        const note = body.note || '';

        const created = [];
        for (let i = 0; i < amount; i++) {
            const key = generateKey();
            const expires = Date.now() + (duration * 60 * 60 * 1000);
            
            DB.keys.set(key, { key, hwid, note, created: Date.now(), expires, uses: 0 });
            created.push(key);

            if (hwid) {
                const hwidData = getHwid(hwid);
                hwidData.key = key;
                hwidData.expires = expires;
            }
        }

        sendWebhook({
            title: '🔧 Keys Created (Admin)',
            color: 0x5865F2,
            fields: [
                { name: 'Amount', value: `${amount}`, inline: true },
                { name: 'Duration', value: `${duration}h`, inline: true },
                { name: 'Keys', value: created.map(k => `\`${k}\``).join('\n').slice(0, 1000) }
            ],
            timestamp: new Date().toISOString()
        });

        return json({ success: true, keys: created, duration: `${duration}h` });
    }

    // Delete Key
    if (route === 'admin/keys/delete') {
        const key = query.key || body.key;
        if (!key) return json({ success: false, error: 'Key required' }, 400);

        if (DB.keys.has(key)) {
            DB.keys.delete(key);
            return json({ success: true, message: 'Key deleted' });
        }
        return json({ success: false, error: 'Key not found' });
    }

    // Get All HWIDs
    if (route === 'admin/hwids') {
        const hwids = [...DB.hwids.values()].map(h => ({
            hwid: h.hwid.slice(0, 16) + '...',
            hwid_full: h.hwid,
            has_key: !!(h.key && h.expires > Date.now()),
            key: h.key,
            expires_in: h.expires ? formatDuration(h.expires - Date.now()) : null,
            checkpoints: h.checkpoints.length,
            created: h.created,
            last_seen: h.last_seen
        })).sort((a, b) => b.last_seen - a.last_seen);

        return json({ success: true, hwids, total: hwids.length });
    }

    // Reset HWID
    if (route === 'admin/hwids/reset') {
        const hwid = query.hwid || body.hwid;
        const key = query.key || body.key;

        if (key) {
            const keyData = DB.keys.get(key);
            if (keyData) {
                keyData.hwid = null;
                return json({ success: true, message: 'Key HWID reset' });
            }
        }

        if (hwid && DB.hwids.has(hwid)) {
            const data = DB.hwids.get(hwid);
            data.key = null;
            data.expires = null;
            data.checkpoints = [];
            return json({ success: true, message: 'HWID reset' });
        }

        return json({ success: false, error: 'Not found' });
    }

    // Update Config
    if (route === 'admin/config') {
        if (req.method === 'GET') {
            return json({
                success: true,
                config: {
                    linkvertise_id: DB.config.linkvertise_id ? '****' + DB.config.linkvertise_id.slice(-4) : '',
                    discord_webhook: DB.config.discord_webhook ? '****' : '',
                    key_duration: DB.config.key_duration,
                    checkpoints: DB.config.checkpoints,
                    site_name: DB.config.site_name
                }
            });
        }

        if (req.method === 'POST') {
            if (body.linkvertise_id !== undefined) DB.config.linkvertise_id = body.linkvertise_id;
            if (body.discord_webhook !== undefined) DB.config.discord_webhook = body.discord_webhook;
            if (body.key_duration !== undefined) DB.config.key_duration = parseInt(body.key_duration);
            if (body.checkpoints !== undefined) DB.config.checkpoints = parseInt(body.checkpoints);
            if (body.site_name !== undefined) DB.config.site_name = body.site_name;

            return json({ success: true, message: 'Config updated' });
        }
    }

    // ==================== 404 ====================
    return json({ success: false, error: 'Not found', route }, 404);
};
