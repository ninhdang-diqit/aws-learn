const API_URL = 'http://localhost:3000/api';

// State
let state = {
    token: localStorage.getItem('token') || null,
    tempToken: null,
    username: null
};

// UI Elements
const views = document.querySelectorAll('.view');
const toastEl = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (state.token) {
        checkTokenAndRedirect();
    } else {
        showView('view-auth');
    }

    setupEventListeners();
    setupCodeInputs();
});

// View Navigation
function showView(viewId) {
    views.forEach(v => {
        v.classList.remove('active');
        setTimeout(() => {
            if (!v.classList.contains('active')) v.style.display = 'none';
        }, 400);
    });

    const view = document.getElementById(viewId);
    if (!view) return;
    view.style.display = 'block';
    setTimeout(() => view.classList.add('active'), 10);
}

function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast ${type} show`;
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

function setupEventListeners() {
    // Auth Form (Login)
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        state.username = username;

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                if (data.requireMfa) {
                    state.tempToken = data.tempToken;
                    
                    // Show/Hide Verify Sections based on user's enrolled methods
                    const totpSection = document.getElementById('totp-verify-section');
                    const passkeySection = document.getElementById('passkey-verify-section');
                    const verifySubtitle = document.getElementById('verify-subtitle');

                    totpSection.style.display = data.hasTotp ? 'block' : 'none';
                    passkeySection.style.display = data.hasPasskey ? 'block' : 'none';

                    if (data.hasTotp && !data.hasPasskey) {
                        verifySubtitle.textContent = 'Enter the 6-digit code from your authenticator app.';
                    } else if (!data.hasTotp && data.hasPasskey) {
                        verifySubtitle.textContent = 'Use your passkey to complete sign in.';
                    } else {
                        verifySubtitle.textContent = 'Choose an authentication method to complete sign in.';
                    }

                    showView('view-mfa-verify');
                    if (data.hasTotp) focusFirstCodeInput('view-mfa-verify');
                } else {
                    state.token = data.token;
                    localStorage.setItem('token', state.token);
                    // Generate MFA setup choices
                    showView('view-security-setup');
                }
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    });

    // Auth Form (Register)
    document.getElementById('btn-register').addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) {
            return showToast('Username and password required', 'error');
        }

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Registered successfully! Now logging in...', 'success');
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    });

    // --- Verify Phase (Login) ---

    // TOTP Verify
    document.getElementById('mfa-verify-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = getCodeFromInputs('mfa-verify-inputs');
        if (code.length !== 6) return showToast('Enter 6-digit code', 'error');

        try {
            const res = await fetch(`${API_URL}/mfa/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken: state.tempToken, code })
            });
            const data = await res.json();

            if (res.ok) {
                state.token = data.token;
                state.tempToken = null;
                localStorage.setItem('token', state.token);
                loadDashboard();
            } else {
                showToast(data.error, 'error');
                clearCodeInputs('mfa-verify-inputs');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    });

    // Passkey Verify
    document.getElementById('btn-verify-passkey').addEventListener('click', async () => {
        try {
            // 1. Get auth options from server
            const optionsRes = await fetch(`${API_URL}/passkey/generate-authentication-options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken: state.tempToken })
            });
            
            const optionsData = await optionsRes.json();
            if (!optionsRes.ok) throw new Error(optionsData.error);
    
            // 2. Start WebAuthn authentication via browser
            const asseResp = await SimpleWebAuthnBrowser.startAuthentication(optionsData);
    
            // 3. Send response for verification
            const verifyRes = await fetch(`${API_URL}/passkey/verify-authentication`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken: state.tempToken, response: asseResp })
            });
            
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error);
            
            if (verifyData.verified) {
                state.token = verifyData.token;
                state.tempToken = null;
                localStorage.setItem('token', state.token);
                showToast('Passkey verified successfully!');
                loadDashboard();
            } else {
                throw new Error('Authentication failed');
            }
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                showToast('Passkey authentication was cancelled.', 'error');
            } else {
                showToast(err.message || 'Passkey verification failed', 'error');
            }
        }
    });


    // --- Setup Phase ---

    // Start TOTP Setup
    document.getElementById('btn-setup-totp-start').addEventListener('click', async () => {
        initTotpSetup();
    });

    // Start Passkey Setup
    document.getElementById('btn-setup-passkey').addEventListener('click', async () => {
        try {
            const optionsRes = await fetch(`${API_URL}/passkey/generate-registration-options`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                }
            });
            
            const optionsData = await optionsRes.json();
            if (!optionsRes.ok) throw new Error(optionsData.error);
    
            const attResp = await SimpleWebAuthnBrowser.startRegistration(optionsData);
    
            const verifyRes = await fetch(`${API_URL}/passkey/verify-registration`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify(attResp)
            });
            
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error);
            
            if (verifyData.verified) {
                showToast('Passkey created successfully!');
                checkTokenAndRedirect(); // Refresh the screen state
            } else {
                throw new Error('Verification failed');
            }
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                showToast('Passkey creation was cancelled.', 'error');
            } else {
                showToast(err.message || 'Passkey creation failed', 'error');
            }
        }
    });

    // TOTP Code Verify (Setup Phase)
    document.getElementById('mfa-setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = getCodeFromInputs('mfa-setup-inputs');
        if (code.length !== 6) return showToast('Enter 6-digit code', 'error');

        try {
            const res = await fetch(`${API_URL}/mfa/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: state.token, code })
            });
            const data = await res.json();

            if (res.ok) {
                showToast('TOTP enabled successfully!', 'success');
                checkTokenAndRedirect(); // refresh status
                clearCodeInputs('mfa-setup-inputs');
            } else {
                showToast(data.error, 'error');
                clearCodeInputs('mfa-setup-inputs');
            }
        } catch (err) {
            showToast('Connection error', 'error');
        }
    });
}

// Code Input Logic
function setupCodeInputs() {
    const inputContainers = document.querySelectorAll('.code-inputs');
    inputContainers.forEach(container => {
        const inputs = container.querySelectorAll('.code-digit');
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').slice(0, 6).replace(/\D/g, '');
                if (pastedData) {
                    for (let i = 0; i < pastedData.length; i++) {
                        if (inputs[i]) inputs[i].value = pastedData[i];
                    }
                    if (inputs[pastedData.length - 1] && pastedData.length < 6) {
                        inputs[pastedData.length].focus();
                    } else {
                        inputs[5].focus();
                    }
                }
            });
        });
    });
}

function getCodeFromInputs(containerId) {
    const inputs = document.querySelectorAll(`#${containerId} .code-digit`);
    let code = '';
    inputs.forEach(i => code += i.value);
    return code;
}

function clearCodeInputs(containerId) {
    const inputs = document.querySelectorAll(`#${containerId} .code-digit`);
    inputs.forEach(i => i.value = '');
    if (inputs[0]) inputs[0].focus();
}

function focusFirstCodeInput(viewId) {
    setTimeout(() => {
        const input = document.querySelector(`#${viewId} .code-digit`);
        if (input) input.focus();
    }, 100);
}

// Actions
async function checkTokenAndRedirect() {
    try {
        const res = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            state.username = data.username;
            
            const btnTotp = document.getElementById('btn-setup-totp-start');
            if (data.mfaEnabled) {
                btnTotp.textContent = 'Authenticator Enabled';
                btnTotp.disabled = true;
                btnTotp.classList.add('secure');
            } else {
                btnTotp.textContent = 'Setup Authenticator';
                btnTotp.disabled = false;
                btnTotp.classList.remove('secure');
            }

            const btnPasskey = document.getElementById('btn-setup-passkey');
            if (data.passkeysEnabled) {
                btnPasskey.textContent = 'Add Another Passkey'; // You can add multiple
            } else {
                btnPasskey.textContent = 'Create Passkey';
            }

            // Go to options page by default if they explicitly ask for settings
            // Otherwise go to dashboard if at least one is enabled
            if (data.mfaEnabled || data.passkeysEnabled) {
                if (!document.getElementById('view-security-setup').classList.contains('active')) {
                   loadDashboard();
                }
            } else {
                showView('view-security-setup');
            }
        } else {
            logout();
        }
    } catch {
        showView('view-auth');
    }
}

async function initTotpSetup() {
    showView('view-mfa-setup');
    try {
        const res = await fetch(`${API_URL}/mfa/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.token })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('qr-image').src = data.qrCodeUrl;
            document.getElementById('secret-text').textContent = data.secret;
            focusFirstCodeInput('view-mfa-setup');
        } else {
            showToast(data.error, 'error');
            if (data.error === "TOTP already enabled") {
                checkTokenAndRedirect();
            }
        }
    } catch (err) {
        showToast('Error generating MFA', 'error');
    }
}

async function loadDashboard() {
    try {
        // First get security status for the UI badges
        const meRes = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const user = await meRes.json();
        
        if (!meRes.ok) throw new Error(user.error || 'Unauthorized');

        // Check if AT LEAST one is enabled
        if (!user.mfaEnabled && !user.passkeysEnabled) {
            showView('view-security-setup');
            return;
        }

        // Now load dashboard msg
        const res = await fetch(`${API_URL}/dashboard`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            document.getElementById('dashboard-message').textContent = data.message;
            
            // Update UI widgets
            const totpWidget = document.getElementById('status-totp');
            const passkeyWidget = document.getElementById('status-passkey');
            
            if (user.mfaEnabled) {
                totpWidget.querySelector('.stat-icon').classList.add('secure');
                totpWidget.querySelector('.status-text').textContent = 'Active';
            } else {
                totpWidget.querySelector('.stat-icon').classList.remove('secure');
                totpWidget.querySelector('.status-text').textContent = 'Not configured';
            }
            
            if (user.passkeysEnabled) {
                passkeyWidget.querySelector('.stat-icon').classList.add('secure');
                passkeyWidget.querySelector('.status-text').textContent = 'Active';
            } else {
                passkeyWidget.querySelector('.stat-icon').classList.remove('secure');
                passkeyWidget.querySelector('.status-text').textContent = 'Not configured';
            }

            showView('view-dashboard');
        } else {
            showToast(data.error, 'error');
            if (data.error.includes("Must enable TOTP or Passkey")) {
                showView('view-security-setup');
            }
        }
    } catch (err) {
        if (err.message === 'Unauthorized') logout();
        else showToast(err.message, 'error');
    }
}

function logout() {
    state.token = null;
    state.tempToken = null;
    state.username = null;
    localStorage.removeItem('token');
    
    clearCodeInputs('mfa-verify-inputs');
    clearCodeInputs('mfa-setup-inputs');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    showView('view-auth');
    showToast('Logged out');
}
