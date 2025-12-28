// Lua Guard - Admin Panel JavaScript

let currentAdmin = null;
let allUsers = [];
let allKeys = [];

document.addEventListener('DOMContentLoaded', function() {
    initAdmin();
    initTabs();
});

// Initialize admin panel
async function initAdmin() {
    try {
        // Check admin authentication
        const authResponse = await fetch('/api/auth/me');
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.user.is_admin) {
            window.location.href = '/dashboard';
            return;
        }
        
        currentAdmin = authData.user;
        updateAdminUI();
        
        // Load data
        await Promise.all([
            loadStats(),
            loadUsers(),
            loadKeys(),
            loadSettings()
        ]);
        
    } catch (error) {
        console.error('Admin init error:', error);
        showToast('Failed to load admin panel', 'error');
    }
}

// Update admin UI
function updateAdminUI() {
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    
    if (userName) userName.textContent = currentAdmin.username;
    if (userAvatar) {
        userAvatar.src = currentAdmin.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
}

// Initialize tabs
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('admin-total-users').textContent = data.stats.totalUsers;
            document.getElementById('admin-total-keys').textContent = data.stats.totalKeys;
            document.getElementById('admin-active-keys').textContent = data.stats.activeKeys;
            document.getElementById('admin-banned-users').textContent = data.stats.bannedUsers;
        }
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
            renderUsersTable(allUsers);
        }
    } catch (error) {
        console.error('Load users error:', error);
    }
}

// Render users table
function renderUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    
    if (!users.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">No users found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <div class="user-cell">
                    <img src="${user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar">
                    <span>${escapeHtml(user.username)}</span>
                </div>
            </td>
            <td><code>${user.discord_id}</code></td>
            <td>${formatDate(user.join_date)}</td>
            <td>${user.total_keys_generated}</td>
            <td>
                ${user.is_banned 
                    ? '<span class="status-badge banned">Banned</span>'
                    : user.is_whitelisted 
                        ? '<span class="status-badge whitelisted">Whitelisted</span>'
                        : user.is_admin
                            ? '<span class="status-badge active">Admin</span>'
                            : '<span class="status-badge active">Active</span>'
                }
            </td>
            <td>
                <div class="action-btns">
                    ${!user.is_banned 
                        ? `<button class="action-btn danger" onclick="banUser('${user.discord_id}', '${escapeHtml(user.username)}')">
                            <i class="fas fa-ban"></i>
                           </button>`
                        : `<button class="action-btn" onclick="unbanUser('${user.discord_id}')">
                            <i class="fas fa-check"></i>
                           </button>`
                    }
                    ${!user.is_whitelisted 
                        ? `<button class="action-btn" onclick="whitelistUser('${user.discord_id}')" title="Whitelist">
                            <i class="fas fa-star"></i>
                           </button>`
                        : `<button class="action-btn" onclick="unwhitelistUser('${user.discord_id}')" title="Remove Whitelist">
                            <i class="fas fa-star-half-alt"></i>
                           </button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

// Load keys
async function loadKeys() {
    try {
        const response = await fetch('/api/admin/keys');
        const data = await response.json();
        
        if (data.success) {
            allKeys = data.keys;
            renderKeysTable(allKeys);
        }
    } catch (error) {
        console.error('Load keys error:', error);
    }
}

// Render keys table
function renderKeysTable(keys) {
    const tbody = document.getElementById('keys-table-body-admin');
    
    if (!keys.length) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">No keys found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = keys.map(key => `
        <tr>
            <td><code>${key.key.substring(0, 20)}...</code></td>
            <td>${escapeHtml(key.discord_username || 'Unknown')}</td>
            <td><code>${key.hwid}</code></td>
            <td>${formatDate(key.created_at)}</td>
            <td>${formatDate(key.expires_at)}</td>
            <td>
                <span class="status-badge ${key.is_active && !key.is_expired ? 'active' : 'expired'}">
                    ${key.is_active && !key.is_expired ? 'Active' : 'Expired'}
                </span>
            </td>
            <td>
                <div class="action-btns">
                    <button class="action-btn" onclick="copyToClipboard('${key.key}')" title="Copy Key">
                        <i class="fas fa-copy"></i>
                    </button>
                    ${key.is_active 
                        ? `<button class="action-btn danger" onclick="deactivateKey(${key.id})" title="Deactivate">
                            <i class="fas fa-times"></i>
                           </button>`
                        : ''
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        
        if (data.success && data.settings) {
            if (data.settings.linkvertise) {
                document.getElementById('linkvertise-publisher-id').value = data.settings.linkvertise.publisher_id || '';
                document.getElementById('linkvertise-active').checked = data.settings.linkvertise.is_active;
            }
            if (data.settings.lootlabs) {
                document.getElementById('lootlabs-publisher-id').value = data.settings.lootlabs.publisher_id || '';
                document.getElementById('lootlabs-active').checked = data.settings.lootlabs.is_active;
            }
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

// Ban user
function banUser(discordId, username) {
    showActionModal(
        'Ban User',
        `Are you sure you want to ban ${username}?`,
        true,
        async (reason) => {
            try {
                const response = await fetch('/api/admin/ban', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        discord_id: discordId,
                        action: 'ban',
                        reason: reason
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showToast('User banned successfully');
                    await loadUsers();
                    await loadStats();
                } else {
                    showToast(data.error || 'Failed to ban user', 'error');
                }
            } catch (error) {
                console.error('Ban user error:', error);
                showToast('Failed to ban user', 'error');
            }
        }
    );
}

// Unban user
async function unbanUser(discordId) {
    try {
        const response = await fetch('/api/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discord_id: discordId,
                action: 'unban'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('User unbanned successfully');
            await loadUsers();
            await loadStats();
        } else {
            showToast(data.error || 'Failed to unban user', 'error');
        }
    } catch (error) {
        console.error('Unban user error:', error);
        showToast('Failed to unban user', 'error');
    }
}

// Whitelist user
async function whitelistUser(discordId) {
    try {
        const response = await fetch('/api/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discord_id: discordId,
                action: 'whitelist'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('User whitelisted successfully');
            await loadUsers();
        } else {
            showToast(data.error || 'Failed to whitelist user', 'error');
        }
    } catch (error) {
        console.error('Whitelist user error:', error);
        showToast('Failed to whitelist user', 'error');
    }
}

// Remove whitelist
async function unwhitelistUser(discordId) {
    try {
        const response = await fetch('/api/admin/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discord_id: discordId,
                action: 'unwhitelist'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Whitelist removed successfully');
            await loadUsers();
        } else {
            showToast(data.error || 'Failed to remove whitelist', 'error');
        }
    } catch (error) {
        console.error('Unwhitelist user error:', error);
        showToast('Failed to remove whitelist', 'error');
    }
}

// Save Linkvertise settings
async function saveLinkvertiseSettings() {
    const publisherId = document.getElementById('linkvertise-publisher-id').value;
    const token = document.getElementById('linkvertise-token').value;
    const isActive = document.getElementById('linkvertise-active').checked;
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                integration_type: 'linkvertise',
                publisher_id: publisherId,
                anti_bypass_token: token,
                is_active: isActive
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Linkvertise settings saved!');
        } else {
            showToast(data.error || 'Failed to save settings', 'error');
        }
    } catch (error) {
        console.error('Save settings error:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Save LootLabs settings
async function saveLootLabsSettings() {
    const publisherId = document.getElementById('lootlabs-publisher-id').value;
    const apiKey = document.getElementById('lootlabs-api-key').value;
    const isActive = document.getElementById('lootlabs-active').checked;
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                integration_type: 'lootlabs',
                publisher_id: publisherId,
                api_key: apiKey,
                is_active: isActive
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('LootLabs settings saved!');
        } else {
            showToast(data.error || 'Failed to save settings', 'error');
        }
    } catch (error) {
        console.error('Save settings error:', error);
        showToast('Failed to save settings', 'error');
    }
}

// Save webhook settings
async function saveWebhookSettings() {
    const webhookUrl = document.getElementById('discord-webhook').value;
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                integration_type: 'linkvertise',
                webhook_url: webhookUrl
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Webhook saved!');
        } else {
            showToast(data.error || 'Failed to save webhook', 'error');
        }
    } catch (error) {
        console.error('Save webhook error:', error);
        showToast('Failed to save webhook', 'error');
    }
}

// Test webhook
async function testWebhook() {
    const webhookUrl = document.getElementById('discord-webhook').value;
    
    if (!webhookUrl) {
        showToast('Please enter a webhook URL first', 'error');
        return;
    }
    
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: '🧪 Test Webhook',
                    description: 'This is a test message from Lua Guard Admin Panel.',
                    color: 0x5865F2,
                    timestamp: new Date().toISOString()
                }]
            })
        });
        
        if (response.ok) {
            showToast('Test webhook sent!');
        } else {
            showToast('Failed to send test webhook', 'error');
        }
    } catch (error) {
        console.error('Test webhook error:', error);
        showToast('Failed to send test webhook', 'error');
    }
}

// Show action modal
function showActionModal(title, message, showReason, onConfirm) {
    const modal = document.getElementById('action-modal');
    const modalTitle = document.getElementById('action-modal-title');
    const modalMessage = document.getElementById('action-modal-message');
    const reasonGroup = document.getElementById('action-reason-group');
    const confirmBtn = document.getElementById('action-confirm-btn');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    reasonGroup.style.display = showReason ? 'block' : 'none';
    
    confirmBtn.onclick = () => {
        const reason = document.getElementById('action-reason').value;
        closeActionModal();
        onConfirm(reason);
    };
    
    modal.classList.add('active');
}

// Close action modal
function closeActionModal() {
    const modal = document.getElementById('action-modal');
    const reasonInput = document.getElementById('action-reason');
    
    modal.classList.remove('active');
    reasonInput.value = '';
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = toast.querySelector('i');
    
    toastMessage.textContent = message;
    
    toastIcon.className = type === 'error' 
        ? 'fas fa-exclamation-circle' 
        : 'fas fa-check-circle';
    
    toast.style.borderColor = type === 'error' ? '#ED4245' : '#57F287';
    toastIcon.style.color = type === 'error' ? '#ED4245' : '#57F287';
    
    toast.classList.add('active');
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Search functionality
document.getElementById('user-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.discord_id.includes(query)
    );
    renderUsersTable(filtered);
});

document.getElementById('key-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allKeys.filter(key => 
        key.key.toLowerCase().includes(query) ||
        (key.discord_username && key.discord_username.toLowerCase().includes(query))
    );
    renderKeysTable(filtered);
});

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
