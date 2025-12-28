// Lua Guard - Dashboard JavaScript

let currentUser = null;
let activeKey = null;
let countdownInterval = null;
let checkInterval = null;

document.addEventListener('DOMContentLoaded', function() {
    initDashboard();
});

// Initialize dashboard
async function initDashboard() {
    showLoading(true);
    
    try {
        // Check authentication
        const authResponse = await fetch('/api/auth/me');
        const authData = await authResponse.json();
        
        if (!authData.success) {
            window.location.href = '/';
            return;
        }
        
        currentUser = authData.user;
        updateUserUI();
        
        // Check for key in URL params
        const params = new URLSearchParams(window.location.search);
        const newKey = params.get('key');
        const success = params.get('success');
        
        if (newKey && success === 'true') {
            showSuccessModal(newKey);
            window.history.replaceState({}, document.title, '/dashboard');
        }
        
        // Load user keys
        await loadUserKeys();
        
    } catch (error) {
        console.error('Dashboard init error:', error);
        showToast('Failed to load dashboard', 'error');
    } finally {
        showLoading(false);
    }
}

// Update UI with user data
function updateUserUI() {
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const welcomeName = document.getElementById('welcome-name');
    const adminLink = document.getElementById('admin-link');
    const userStatus = document.getElementById('user-status');
    const userJoinDate = document.getElementById('user-join-date');
    const userTotalKeys = document.getElementById('user-total-keys');
    
    if (userName) userName.textContent = currentUser.username;
    if (welcomeName) welcomeName.textContent = currentUser.username;
    if (userAvatar) {
        userAvatar.src = currentUser.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    
    if (adminLink && currentUser.is_admin) {
        adminLink.style.display = 'inline';
        adminLink.href = '/admin';
    }
    
    if (userStatus) {
        if (currentUser.is_whitelisted) {
            userStatus.textContent = 'Whitelisted';
            userStatus.style.color = '#5865F2';
        } else if (currentUser.is_admin) {
            userStatus.textContent = 'Admin';
            userStatus.style.color = '#ED4245';
        } else {
            userStatus.textContent = 'Standard';
        }
    }
    
    if (userJoinDate) {
        userJoinDate.textContent = formatDate(currentUser.join_date);
    }
    
    if (userTotalKeys) {
        userTotalKeys.textContent = currentUser.total_keys_generated || 0;
    }
}

// Load user's keys
async function loadUserKeys() {
    try {
        const response = await fetch('/api/keys/user');
        const data = await response.json();
        
        if (data.success) {
            updateKeysUI(data.keys);
            updateUserTotalKeys(data.total_generated);
        }
    } catch (error) {
        console.error('Load keys error:', error);
    }
}

// Update keys UI
function updateKeysUI(keys) {
    const activeKeyCard = document.getElementById('active-key-card');
    const noKeyCard = document.getElementById('no-key-card');
    const keysTableBody = document.getElementById('keys-table-body');
    
    // Find active key
    activeKey = keys.find(k => k.is_active);
    
    if (activeKey) {
        // Show active key card
        activeKeyCard.style.display = 'block';
        noKeyCard.style.display = 'none';
        
        document.getElementById('current-key').textContent = activeKey.key;
        document.getElementById('key-created').textContent = formatDate(activeKey.created_at);
        document.getElementById('key-expires').textContent = formatDate(activeKey.expires_at);
        document.getElementById('key-hwid').textContent = activeKey.hwid;
        
        // Start countdown
        startCountdown(activeKey.expires_at);
    } else {
        // Show no key card
        activeKeyCard.style.display = 'none';
        noKeyCard.style.display = 'block';
        
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    }
    
    // Update keys table
    if (keysTableBody) {
        if (keys.length === 0) {
            keysTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="5">No keys found. Generate your first key!</td>
                </tr>
            `;
        } else {
            keysTableBody.innerHTML = keys.map(key => `
                <tr>
                    <td><code>${key.key.substring(0, 20)}...</code></td>
                    <td>${formatDate(key.created_at)}</td>
                    <td>${formatDate(key.expires_at)}</td>
                    <td>
                        <span class="status-badge ${key.is_active ? 'active' : 'expired'}">
                            ${key.is_active ? 'Active' : 'Expired'}
                        </span>
                    </td>
                    <td>${key.validation_count}</td>
                </tr>
            `).join('');
        }
    }
}

// Update total keys count
function updateUserTotalKeys(count) {
    const element = document.getElementById('user-total-keys');
    if (element) {
        element.textContent = count;
    }
}

// Start countdown timer
function startCountdown(expiresAt) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    const updateTimer = () => {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires - now;
        
        if (diff <= 0) {
            document.getElementById('time-remaining').textContent = 'Expired';
            clearInterval(countdownInterval);
            loadUserKeys(); // Refresh
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        document.getElementById('time-remaining').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };
    
    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// Generate new key
async function generateKey() {
    // Get HWID (in real scenario, this would come from the Roblox executor)
    const hwid = await getHWID();
    
    if (!hwid) {
        showToast('Failed to get HWID. Please try from the Roblox script.', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/keys/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hwid })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Failed to generate key', 'error');
            return;
        }
        
        if (data.hasActiveKey) {
            // User already has an active key
            showToast('You already have an active key!', 'info');
            await loadUserKeys();
            return;
        }
        
        if (data.key) {
            // Key generated directly (whitelisted user)
            showSuccessModal(data.key);
            await loadUserKeys();
            return;
        }
        
        if (data.requiresVerification) {
            // Show verification modal
            showVerificationModal(data.verificationUrl, data.requestId);
        }
        
    } catch (error) {
        console.error('Generate key error:', error);
        showToast('Failed to generate key', 'error');
    } finally {
        showLoading(false);
    }
}

// Get HWID (simulated for web, real in Roblox)
async function getHWID() {
    // For web dashboard, generate a browser fingerprint
    // In the actual Roblox script, this would use executor's getHWID function
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('HWID Generation', 2, 2);
    
    const canvasData = canvas.toDataURL();
    const userAgent = navigator.userAgent;
    const language = navigator.language;
    const platform = navigator.platform;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const fingerprint = `${canvasData}|${userAgent}|${language}|${platform}|${timezone}`;
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return 'WEB-' + Math.abs(hash).toString(16).toUpperCase().padStart(16, '0');
}

// Show verification modal
function showVerificationModal(url, requestId) {
    const modal = document.getElementById('verification-modal');
    const link = document.getElementById('verification-link');
    const status = document.getElementById('verification-status');
    
    if (modal && link) {
        link.href = url;
        modal.classList.add('active');
        
        // Start checking for completion
        startVerificationCheck(requestId);
    }
}

// Start checking verification status
function startVerificationCheck(requestId) {
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    
    checkInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/keys/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requestId })
            });
            
            const data = await response.json();
            
            if (data.status === 'completed' && data.key) {
                clearInterval(checkInterval);
                closeModal();
                showSuccessModal(data.key);
                await loadUserKeys();
            } else if (data.status === 'not_found') {
                clearInterval(checkInterval);
                closeModal();
                showToast('Verification expired. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Verification check error:', error);
        }
    }, 3000); // Check every 3 seconds
}

// Show success modal
function showSuccessModal(key) {
    const modal = document.getElementById('success-modal');
    const keyDisplay = document.getElementById('generated-key-display');
    
    if (modal && keyDisplay) {
        keyDisplay.textContent = key;
        modal.classList.add('active');
    }
}

// Close success modal
function closeSuccessModal() {
    closeModal();
    loadUserKeys();
}

// Copy key to clipboard
function copyKey() {
    const key = document.getElementById('current-key');
    if (key) {
        navigator.clipboard.writeText(key.textContent);
        showToast('Key copied to clipboard!');
    }
}

// Copy generated key
function copyGeneratedKey() {
    const key = document.getElementById('generated-key-display');
    if (key) {
        navigator.clipboard.writeText(key.textContent);
        showToast('Key copied to clipboard!');
    }
}

// Copy script to clipboard
function copyScript() {
    const script = 'loadstring(game:HttpGet("https://lua-guard-test.vercel.app/lua/loader.lua"))()';
    navigator.clipboard.writeText(script);
    showToast('Script copied to clipboard!');
}

// Logout
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/';
    }
}

// Show/hide loading overlay
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.toggle('active', show);
    }
}

// Close modal
function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.classList.remove('active'));
    
    if (checkInterval) {
        clearInterval(checkInterval);
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = toast.querySelector('i');
    
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        
        // Update icon based on type
        toastIcon.className = type === 'error' 
            ? 'fas fa-exclamation-circle' 
            : type === 'info' 
                ? 'fas fa-info-circle'
                : 'fas fa-check-circle';
        
        toast.style.borderColor = type === 'error' 
            ? '#ED4245' 
            : type === 'info' 
                ? '#5865F2'
                : '#57F287';
        
        toastIcon.style.color = type === 'error' 
            ? '#ED4245' 
            : type === 'info' 
                ? '#5865F2'
                : '#57F287';
        
        toast.classList.add('active');
        
        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
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

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});

// Handle keyboard events
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});
