const API_URL = 'http://localhost:3000/api';

// UI Elements
const toastEl = document.getElementById('toast');
const usernameInput = document.getElementById('username');
const dashboardMessage = document.getElementById('dashboardMessage');

// State
let currentToken = localStorage.getItem('passkey_token') || null;

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => {
    if (currentToken) {
        checkAuth();
    } else {
        showView('view-auth');
    }
});

// View Navigation
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

// Toast Notifications
function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    
    setTimeout(() => {
        toastEl.className = 'toast hidden';
    }, 3000);
}

// Global Auth Error Handler
function handleAuthError(err) {
    if (err.message === 'Unauthorized') {
        logout();
    } else {
        showToast(err.message || 'An error occurred', 'error');
    }
}

// --- Register Flow --- //
document.getElementById('btn-register').addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) return showToast('Please enter a username', 'error');

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentToken = data.token;
        localStorage.setItem('passkey_token', currentToken);
        
        showToast('Registration started. Please create a Passkey.');
        showView('view-passkey-setup');
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// --- Register Passkey Flow --- //
document.getElementById('btn-setup-passkey').addEventListener('click', async () => {
    if (!currentToken) return logout();

    try {
        // 1. Get registration options from server
        const optionsRes = await fetch(`${API_URL}/passkey/generate-registration-options`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        const optionsData = await optionsRes.json();
        if (!optionsRes.ok) throw new Error(optionsData.error);

        // 2. Start WebAuthn registration
        const attResp = await SimpleWebAuthnBrowser.startRegistration(optionsData);

        // 3. Send response back to server for verification
        const verifyRes = await fetch(`${API_URL}/passkey/verify-registration`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(attResp)
        });
        
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error);
        
        if (verifyData.verified) {
            showToast('Passkey created successfully!');
            loadDashboard();
        } else {
            throw new Error('Verification failed');
        }

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showToast('Passkey creation was cancelled or blocked.', 'error');
        } else {
            showToast(err.message || 'Passkey creation failed', 'error');
        }
    }
});


// --- Login Flow --- //
document.getElementById('btn-login').addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) return showToast('Please enter your username', 'error');

    try {
        // 1. Get authentication options from server
        const optionsRes = await fetch(`${API_URL}/passkey/generate-authentication-options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const optionsData = await optionsRes.json();
        if (!optionsRes.ok) throw new Error(optionsData.error);

        // 2. Start WebAuthn authentication
        const asseResp = await SimpleWebAuthnBrowser.startAuthentication(optionsData);

        // 3. Send response back to server for verification
        const verifyRes = await fetch(`${API_URL}/passkey/verify-authentication`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, response: asseResp })
        });
        
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error);
        
        if (verifyData.verified) {
            currentToken = verifyData.token;
            localStorage.setItem('passkey_token', currentToken);
            showToast('Logged in successfully!');
            loadDashboard();
        } else {
            throw new Error('Authentication failed');
        }

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showToast('Passkey authentication was cancelled or blocked.', 'error');
        } else {
            showToast(err.message || 'Login failed', 'error');
        }
    }
});


// --- Dashboard / Auth Check --- //
async function checkAuth() {
    try {
        const res = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!res.ok) {
            if (res.status === 401) throw new Error('Unauthorized');
            const data = await res.json();
            throw new Error(data.error);
        }
        
        const user = await res.json();
        if (!user.passkeysEnabled) {
            // Setup incomplete
            showView('view-passkey-setup');
        } else {
            // Already set up
            loadDashboard();
        }
    } catch (err) {
        handleAuthError(err);
    }
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await res.json();
        if (!res.ok) {
            if (res.status === 401) throw new Error('Unauthorized');
            throw new Error(data.error);
        }
        
        const msgEl = document.getElementById('dashboard-message');
        if (msgEl) msgEl.textContent = data.message;
        
        showView('view-dashboard');
    } catch (err) {
        if (err.message.includes('Must setup passkey')) {
            showView('view-passkey-setup');
        } else {
            handleAuthError(err);
        }
    }
}

function logout() {
    currentToken = null;
    localStorage.removeItem('passkey_token');
    
    // Clear forms
    document.querySelectorAll('form').forEach(f => f.reset());
    
    showView('view-auth');
    showToast('Logged out');
}
