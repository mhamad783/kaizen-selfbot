require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const activeClients = new Map();
const clients = [];
const settingsPath = path.join(__dirname, 'data', 'app_settings.json');
let nextAccountId = 1;
let server;

function readSettings() {
  try {
    return { prefix: '!', theme: 'dark', ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
  } catch {
    return { prefix: '!', theme: 'dark' };
  }
}

let settings = readSettings();
process.env.PREFIX = settings.prefix;

let connectionState = {
  phase: 'idle',
  message: 'Ready to connect your Discord accounts.'
};

function parseTokenInput(raw) {
  return [...new Set(
    String(raw || '')
      .replace(/\r/g, '')
      .split(/\n|,/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token.length > 20)
  )];
}

function createClient(key, token) {
  const client = new Client({ checkUpdate: false });
  client.tokenKey = key;
  client.token = token;
  client.connectionStatus = 'connecting';
  client.userLabel = 'Connecting...';

  client.on('ready', () => {
    client.connectionStatus = 'online';
    client.userLabel = client.user ? client.user.tag : 'Ready';
    connectionState.phase = 'connected';
    connectionState.message = `${activeClients.size} account(s) online`;
    console.log(`[KAIZEN] ${key} connected as ${client.user.tag}`);
  });

  client.on('disconnect', () => {
    client.connectionStatus = 'offline';
    client.userLabel = 'Disconnected';
  });

  client.on('error', (error) => {
    client.connectionStatus = 'error';
    client.userLabel = 'Error';
    console.error(`[KAIZEN] ${key} client error:`, error.message || error);
  });

  return client;
}

async function clearClients() {
  for (const [, entry] of activeClients) {
    try {
      if (entry.client && typeof entry.client.destroy === 'function') {
        await entry.client.destroy();
      }
    } catch (error) {
      console.error('[KAIZEN] Failed to destroy client:', error.message);
    }
  }

  activeClients.clear();
  clients.length = 0;
}

function startAccount(token) {
  const key = `account_${nextAccountId++}`;
  const client = createClient(key, token);
  clients.push(client);
  activeClients.set(key, { key, token, client });

  client.login(token).catch((error) => {
    client.connectionStatus = 'error';
    client.userLabel = 'Login failed';
    console.error(`[KAIZEN] ${key} login failed:`, error.message || error);
    connectionState.phase = 'error';
    connectionState.message = 'One or more accounts failed to connect.';
  });

  return key;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.get('/api/status', (req, res) => {
  const list = Array.from(activeClients.values()).map((entry) => ({
    key: entry.key,
    status: entry.client.connectionStatus || 'connecting',
    label: entry.client.userLabel || 'Connecting...',
    token: `${entry.token.slice(0, 8)}••••${entry.token.slice(-4)}`,
    ready: entry.client.connectionStatus === 'online'
  }));

  res.json({
    ok: true,
    phase: connectionState.phase,
    message: connectionState.message,
    total: list.length,
    ready: list.filter((item) => item.ready).length,
    accounts: list
  });
});

app.post('/api/connect', async (req, res) => {
  const tokens = parseTokenInput(req.body.tokens);

  if (!tokens.length) {
    return res.status(400).json({
      success: false,
      message: 'Please paste at least one Discord token.'
    });
  }

  try {
    await clearClients();
  } catch (error) {
    console.error('[KAIZEN] Cleanup failed:', error.message);
  }

  connectionState = {
    phase: 'connecting',
    message: `Connecting ${tokens.length} account(s)...`
  };

  tokens.forEach(startAccount);

  const readyCount = Array.from(activeClients.values()).filter((entry) => entry.client.connectionStatus === 'online').length;
  connectionState.phase = readyCount > 0 ? 'connected' : 'connecting';
  connectionState.message = readyCount > 0
    ? `${readyCount} account(s) online`
    : `Connecting ${tokens.length} account(s)...`;

  res.json({
    success: true,
    count: tokens.length,
    ready: readyCount,
    message: connectionState.message
  });
});

app.get('/api/settings', (req, res) => {
  res.json({ ...settings, accounts: Array.from(activeClients.values()).map(({ key, client }) => ({
    key,
    label: client.userLabel || 'Connecting...',
    status: client.connectionStatus || 'connecting'
  })) });
});

app.post('/api/settings', (req, res) => {
  const prefix = String(req.body.prefix || '').trim();
  const theme = req.body.theme === 'light' ? 'light' : 'dark';

  if (!prefix || prefix.length > 8 || /\s/.test(prefix)) {
    return res.status(400).json({ success: false, message: 'Prefix must be 1-8 characters with no spaces.' });
  }

  settings = { prefix, theme };
  process.env.PREFIX = prefix;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  res.json({ success: true, message: 'Settings saved.' });
});

app.post('/api/accounts/add', (req, res) => {
  const [token] = parseTokenInput(req.body.token);
  if (!token) return res.status(400).json({ success: false, message: 'Enter a valid Discord token.' });
  if (Array.from(activeClients.values()).some((entry) => entry.token === token)) {
    return res.status(409).json({ success: false, message: 'That account is already connected.' });
  }

  const key = startAccount(token);
  connectionState.phase = 'connecting';
  connectionState.message = 'Connecting the new account...';
  res.json({ success: true, key, message: connectionState.message });
});

app.post('/api/accounts/:key/logout', (req, res) => {
  const entry = activeClients.get(req.params.key);
  if (!entry) return res.status(404).json({ success: false, message: 'Account not found.' });

  try {
    entry.client.destroy();
  } catch (error) {
    console.error(`[KAIZEN] Failed to disconnect ${entry.key}:`, error.message || error);
    return res.status(500).json({ success: false, message: 'Could not disconnect this account.' });
  }

  activeClients.delete(entry.key);
  const clientIndex = clients.indexOf(entry.client);
  if (clientIndex !== -1) clients.splice(clientIndex, 1);

  if (clients.length === 0) {
    connectionState = { phase: 'idle', message: 'Ready to connect your Discord accounts.' };
  }
  res.clearCookie('active_client');
  res.json({ success: true, message: 'Account disconnected.' });
});

app.post('/api/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Kaizen is stopping.' });
  setTimeout(async () => {
    await clearClients();
    server.close(() => process.exit(0));
  }, 100);
});

require('./dashboard')(clients, app);

const HOST = '0.0.0.0';

server = app.listen(PORT, HOST, () => {
  console.log(`[KAIZEN] Web dashboard listening on ${HOST}:${PORT}`);
  console.log(`[KAIZEN] Local access: http://localhost:${PORT}`);
  console.log('[KAIZEN] Open the dashboard to connect accounts and manage features.');
});
