#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const ENV_PATH = '.env.local';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const PORT = Number(readEnvValue('GMAIL_OAUTH_PORT') || 53682);
const CALLBACK_PATH = '/oauth2callback';
const REDIRECT_URI = readEnvValue('GMAIL_REDIRECT_URI') || `http://127.0.0.1:${PORT}${CALLBACK_PATH}`;

const fileCredentials = readOAuthClientFile();
const clientId = readEnvValue('GMAIL_CLIENT_ID') || readEnvValue('GOOGLE_CLIENT_ID') || fileCredentials.clientId;
const clientSecret = readEnvValue('GMAIL_CLIENT_SECRET') || readEnvValue('GOOGLE_CLIENT_SECRET') || fileCredentials.clientSecret;

if (!clientId || !clientSecret) {
  console.error('Missing Gmail OAuth credentials.');
  console.error('Put the Google OAuth client JSON at google-oauth-client.json, or add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env.local.');
  console.error('Then run:');
  console.error('  npm.cmd run gmail:auth');
  process.exit(1);
}

const state = cryptoRandom();
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('state', state);

const codePromise = waitForCallback(state);
fs.writeFileSync('gmail-auth-url.txt', `${authUrl}\n`, 'utf8');
console.log('Opening Google consent page...');
console.log(String(authUrl));
console.log('If the browser shows an invalid_request error, open the full URL saved in gmail-auth-url.txt.');
openBrowser(String(authUrl));

const code = await codePromise;
const token = await exchangeCode(code);

if (!token.refresh_token) {
  console.error('Google did not return a refresh token.');
  console.error('Remove this app from Google account permissions and rerun npm.cmd run gmail:auth.');
  process.exit(1);
}

upsertEnv({
  GMAIL_CLIENT_ID: clientId,
  GMAIL_CLIENT_SECRET: clientSecret,
  GMAIL_REFRESH_TOKEN: token.refresh_token,
});

console.log('Gmail refresh token saved to .env.local.');
console.log('Next: add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN to GitHub repository secrets.');

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', REDIRECT_URI);
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const error = url.searchParams.get('error');
        if (error) throw new Error(error);
        if (url.searchParams.get('state') !== expectedState) throw new Error('OAuth state mismatch');

        const code = url.searchParams.get('code');
        if (!code) throw new Error('Missing OAuth code');

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>Gmail connected</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(code);
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String(err.message || err));
        server.close();
        reject(err);
      }
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1');
  });
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error_description || json.error || `Token exchange failed: ${response.status}`);
  }
  return json;
}

function readEnvValue(key) {
  if (process.env[key]) return process.env[key];
  if (!fs.existsSync(ENV_PATH)) return '';

  const line = fs.readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return '';

  const value = line.slice(line.indexOf('=') + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readOAuthClientFile() {
  const candidates = [
    'google-oauth-client.json',
    'credentials.json',
    ...fs.readdirSync('.').filter((name) => /^client_secret.*\.json$/i.test(name)),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const config = json.installed || json.web || json;
    return {
      clientId: config.client_id || '',
      clientSecret: config.client_secret || '',
    };
  }

  return { clientId: '', clientSecret: '' };
}

function upsertEnv(values) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  if (text && !text.endsWith('\n')) text += '\n';

  for (const [key, value] of Object.entries(values)) {
    const safeValue = String(value).replace(/\r?\n/g, '');
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(text)) {
      text = text.replace(pattern, `${key}=${safeValue}`);
    } else {
      text += `${key}=${safeValue}\n`;
    }
  }

  fs.writeFileSync(ENV_PATH, text, 'utf8');
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  child.unref();
}

function cryptoRandom() {
  return randomBytes(16).toString('hex');
}
