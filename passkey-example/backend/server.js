const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// RP (Relying Party) settings - identifying your app
const rpName = 'Passkey Example App';
const rpID = 'localhost';
const origin = `http://${rpID}:3000`;

// In-memory data store
const users = {}; // { username: { id: "uuid", currentChallenge: "string", passkeys: [ { credentialID: Uint8Array, credentialPublicKey: Uint8Array, counter: number, transports: string[] } ] } }
const sessions = {}; // { token: username }

// Helper to generate a token
const generateToken = () => crypto.randomBytes(32).toString('hex');
// Helper to generate User ID
const generateUserId = () => crypto.randomBytes(32).toString('base64url');

app.post('/api/register', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    if (users[username]) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    users[username] = {
        id: generateUserId(),
        currentChallenge: null,
        passkeys: []
    };
    
    // Automatically log in the user (or create a session to setup passkey)
    const token = generateToken();
    sessions[token] = username;
    
    res.json({ message: 'User registered. Please setup Passkey.', token });
});

app.post('/api/passkey/generate-registration-options', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const username = sessions[token];

    if (!username) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = users[username];

    const options = generateRegistrationOptions({
        rpName,
        rpID,
        userID: user.id,
        userName: username,
        attestationType: 'none',
        // Prevent registration of an authenticator that is already registered
        excludeCredentials: user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: 'public-key',
            transports: passkey.transports,
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform',
        },
    });

    user.currentChallenge = options.challenge;
    
    res.json(options);
});

app.post('/api/passkey/verify-registration', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const username = sessions[token];

    if (!username) return res.status(401).json({ error: 'Unauthorized' });

    const user = users[username];
    const body = req.body; // the registration response from client

    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ error: error.message });
    }

    const { verified, registrationInfo } = verification;
    
    if (verified && registrationInfo) {
        const { credentialPublicKey, credentialID, counter } = registrationInfo;

        const existingPasskey = user.passkeys.find(passkey =>
            passkey.credentialID.toString() === credentialID.toString()
        );

        if (!existingPasskey) {
            user.passkeys.push({
                credentialID,
                credentialPublicKey,
                counter,
                transports: body.response.transports || [],
            });
        }
        res.json({ verified: true });
    } else {
        res.status(400).json({ error: 'Verification failed' });
    }
});

// Authentication

app.post('/api/passkey/generate-authentication-options', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    const user = users[username];
    if (!user) {
        // You might want to return a dummy challenge to prevent username enumeration, 
        // but for this example we simply reject it.
        return res.status(404).json({ error: 'User not found' });
    }

    const options = generateAuthenticationOptions({
        rpID,
        allowCredentials: user.passkeys.map(passkey => ({
            id: passkey.credentialID,
            type: 'public-key',
            transports: passkey.transports,
        })),
        userVerification: 'preferred',
    });

    user.currentChallenge = options.challenge;
    
    res.json(options);
});

app.post('/api/passkey/verify-authentication', async (req, res) => {
    const { username, response } = req.body;
    
    if (!username || !response) {
        return res.status(400).json({ error: 'Username and reply required' });
    }
    
    const user = users[username];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const passkey = user.passkeys.find(p => p.credentialID.toString('base64url') === response.id);
    if (!passkey) {
        return res.status(400).json({ error: 'Could not find passkey for user' });
    }

    let verification;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialPublicKey: passkey.credentialPublicKey,
                credentialID: passkey.credentialID,
                counter: passkey.counter,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ error: error.message });
    }

    const { verified, authenticationInfo } = verification;
    
    if (verified) {
        // Update the counter
        passkey.counter = authenticationInfo.newCounter;
        
        // Finalize login (create session)
        const token = generateToken();
        sessions[token] = username;
        
        res.json({ verified: true, token });
    } else {
        res.status(400).json({ error: 'Authentication failed' });
    }
});

// Dashboard
app.get('/api/dashboard', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const username = sessions[token];

    if (!username) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = users[username];
    if (user.passkeys.length === 0) {
        return res.status(403).json({ error: 'Passkey not enabled. Must setup passkey to view dashboard.' });
    }

    res.json({ message: `Hello ${username}, welcome to the secure passkey dashboard!` });
});

app.get('/api/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    const username = sessions[token];

    if (!username) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = users[username];
    res.json({ username, passkeysEnabled: user.passkeys.length > 0 });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
});
