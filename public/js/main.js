// Lua Guard - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    handleUrlParams();
    loadPublicStats();
    initParticles();
});

// Check if user is authenticated
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/check-server');
        const data = await response.json();
        
        const navAuth = document.getElementById('nav-auth');
        
        if (data.authenticated && data.user) {
            navAuth.innerHTML = `
                <a href="/dashboard" class="btn btn-secondary">
                    <i class="fas fa-tachometer-alt"></i>
                    Dashboard
                </a>
            `;
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Handle URL parameters (errors, etc.)
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const invite = params.get('invite');
    
    if (error) {
        switch (error) {
            case 'not_in_server':
                showDiscordModal(invite);
                break;
            case 'banned':
                showError('Account Banned', 'Your account has been banned from using Lua Guard.');
                break;
            case 'auth_failed':
                showError('Authentication Failed', 'Failed to authenticate with Discord. Please try again.');
                break;
            case 'oauth_denied':
                showError('Access Denied', 'You denied the Discord authorization request.');
                break;
            default:
                showError('Error', 'An unexpected error occurred. Please try again.');
        }
        
        // Clean URL
        window.history.replaceState({}, document.title, '/');
    }
}

// Load public statistics
async function loadPublicStats() {
    try {
        const response = await fetch('/api/admin/stats');
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                animateNumber('total-users', data.stats.totalUsers);
                animateNumber('total-keys', data.stats.totalKeys);
                animateNumber('active-keys', data.stats.activeKeys);
                animateNumber('today-keys', data.stats.todayKeys);
            }
        }
    } catch (error) {
        console.error('Stats load error:', error);
    }
}

// Animate number counting
function animateNumber(elementId, target) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const duration = 2000;
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 16);
}

// Show error modal
function showError(title, message) {
    const modal = document.getElementById('error-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    
    if (modal && modalTitle && modalMessage) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.classList.add('active');
    }
}

// Show Discord join modal
function showDiscordModal(inviteUrl) {
    const modal = document.getElementById('discord-modal');
    const inviteLink = document.getElementById('discord-invite-link');
    
    if (modal) {
        if (inviteLink && inviteUrl) {
            inviteLink.href = inviteUrl;
        }
        modal.classList.add('active');
    }
}

// Close modal
function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.classList.remove('active'));
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});

// Initialize particle background
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 1}px;
            height: ${Math.random() * 4 + 1}px;
            background: rgba(88, 101, 242, ${Math.random() * 0.5 + 0.1});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: float ${Math.random() * 10 + 10}s linear infinite;
            animation-delay: ${Math.random() * 5}s;
        `;
        container.appendChild(particle);
    }
    
    // Add floating animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-100vh) translateX(${Math.random() * 100 - 50}px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
