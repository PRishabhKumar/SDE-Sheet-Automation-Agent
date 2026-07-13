// ──────────────────────────────────────────────────────────────────────────────
// LinkedIn OAuth 2.0 Authorization Code Flow — One-time setup script
// Run with: node src/linkedinAuth.js
// ──────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('../config/config');

const { clientId, clientSecret, redirectUri, tokenPath } = config.linkedin;
const SCOPES = 'w_member_social r_liteprofile';

// Random state param to protect against CSRF
const STATE = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const authUrl =
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&state=${STATE}`;

console.log('\n🔑 LinkedIn OAuth — One-Time Authentication\n');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on port 3000...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');

  if (url.pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`OAuth Error: ${error} — ${url.searchParams.get('error_description')}`);
    console.error('OAuth error:', error);
    server.close();
    return;
  }

  if (returnedState !== STATE) {
    res.end('State mismatch — possible CSRF attack. Aborting.');
    console.error('State mismatch!');
    server.close();
    return;
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Fetch the user's person URN (needed for post authorship)
    const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileResponse.json();

    const tokens = {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      personUrn: profile.id,
      name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
    };

    // Save to ~/.sde-agent/linkedin_tokens.json
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));

    console.log('\n Authentication successful!');
    console.log(`   Name       : ${tokens.name}`);
    console.log(`   Person URN : ${tokens.personUrn}`);
    console.log(`   Token expires: ${tokens.expiresAt}`);
    console.log(`   Saved to   : ${tokenPath}\n`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2> Authentication successful!</h2><p>You can close this tab.</p>');
  } catch (err) {
    console.error('Error during token exchange:', err.message);
    res.end(`Error: ${err.message}`);
  } finally {
    server.close();
  }
});

server.listen(3000);