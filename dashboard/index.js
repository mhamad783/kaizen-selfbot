const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = (clients, sharedApp) => {
    const app = sharedApp || express();
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Middleware to set active client
    app.use((req, res, next) => {
        if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/img')) {
            let activeKey = req.cookies.active_client || 'TOKEN';
            req.client = clients.find(c => c.tokenKey === activeKey);
            if (!req.client && clients.length > 0) req.client = clients[0];
            res.locals.clients = clients;
            res.locals.activeClientKey = req.client ? req.client.tokenKey : null;
            res.locals.clientUser = req.client ? req.client.user : null;
        }
        next();
    });

    // API to switch client
    app.post('/api/switch_client', (req, res) => {
        const { key } = req.body;
        if (clients.find(c => c.tokenKey === key)) {
            res.cookie('active_client', key, { maxAge: 30 * 24 * 60 * 60 * 1000 });
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    });

    // Set view engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Static files
    app.use(express.static(path.join(__dirname, 'public')));
    app.use((req, res, next) => {
        const discordTabApi = req.path.startsWith('/api/discord/tab/');
        if (!req.client && !discordTabApi && req.path !== '/' && req.path !== '/settings' && req.path !== '/discord' && !req.path.startsWith('/css') && !req.path.startsWith('/js')) {
            return res.redirect('/');
        }
        next();
    });

    app.get('/', (req, res) => {
        const user = req.client && req.client.user ? req.client.user : null;
        const uptimeSeconds = user ? Math.floor(req.client.uptime / 1000) : 0;
        const statusManager = user ? require('../commands/statusManager') : null;
        const statusData = statusManager ? statusManager.loadData(req.client) : {};
        const status = statusData.status || 'online';
        const currentActivity = statusData.custom_status || '';
        const currentEmoji = statusData.emoji || '';

        res.render('index', {
            user,
            uptimeSeconds,
            status: status,
            currentActivity,
            currentEmoji,
            page: 'home'
        });
    });

    app.get('/settings', (req, res) => {
        const settingsPath = path.join(__dirname, '..', 'data', 'app_settings.json');
        let settings = { prefix: process.env.PREFIX || '!', theme: 'dark' };
        try {
            settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
        } catch (error) {
            if (error.code !== 'ENOENT') console.error('[KAIZEN] Could not read settings:', error.message);
        }

        res.render('settings', {
            user: req.client ? req.client.user : null,
            clients,
            settings,
            page: 'settings'
        });
    });

    app.post('/update-status', async (req, res) => {
        try {
            const { status, custom_status, emoji } = req.body;

            const statusManager = require('../commands/statusManager');
            statusManager.saveData(req.client, {
                status: status,
                custom_status: custom_status,
                emoji: emoji
            });

            // Trigger update via RPC Manager (which merges RPC + Status)
            const rpcManager = require('../commands/rpcManager');
            await rpcManager.setPresence(req.client, rpcManager.loadData(req.client));

            if (req.xhr || req.headers.accept && req.headers.accept.indexOf('json') > -1) {
                return res.json({ success: true, message: 'Status updated!' });
            }

            res.redirect('/');
        } catch (error) {
            console.error(error);
            res.redirect('/?error=' + encodeURIComponent(error.message));
        }
    });

    // --- API & Routes ---

    // Live Logs Endpoint
    app.get('/api/logs', (req, res) => {
        const logPath = path.join(__dirname, '..', 'data', 'afklog.json');
        if (fs.existsSync(logPath)) {
            const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            res.json(logs);
        } else {
            res.json([]);
        }
    });

    // --- AFK Routes ---

    app.get('/afk', (req, res) => {
        if (!req.client.user) return res.send('Bot loading...');

        const afkPath = path.join(__dirname, '..', 'data', 'afk.json');
        const logPath = path.join(__dirname, '..', 'data', 'afklog.json');

        let afkData = { isOn: false, reason: '' };
        let logs = [];

        if (fs.existsSync(afkPath)) afkData = JSON.parse(fs.readFileSync(afkPath, 'utf8'));
        if (fs.existsSync(logPath)) logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));

        res.render('afk', {
            user: req.client.user,
            afkData,
            logs,
            page: 'afk'
        });
    });

    app.post('/afk/save', (req, res) => {
        let { isOn, reason, logsEnabled } = req.body;
        const afkPath = path.join(__dirname, '..', 'data', 'afk.json');

        const checkBoolean = (val) => {
            if (Array.isArray(val)) return val.includes('on');
            return val === 'on';
        };

        const isAfkOn = checkBoolean(isOn);
        const isLogsOn = checkBoolean(logsEnabled);

        let existingData = {};
        if (fs.existsSync(afkPath)) existingData = JSON.parse(fs.readFileSync(afkPath, 'utf8'));

        const newData = {
            ...existingData,
            isOn: isAfkOn,
            reason: reason || existingData.reason || 'I am currently AFK.',
            logsEnabled: isLogsOn,
            startTime: isAfkOn ? Date.now() : (existingData.startTime || 0)
        };

        fs.writeFileSync(afkPath, JSON.stringify(newData, null, 2));

        if (req.xhr || req.headers.accept && req.headers.accept.indexOf('json') > -1) {
            return res.json({ success: true, message: 'Settings saved!' });
        }

        res.redirect('/afk');
    });

    app.post('/afk/clear-logs', (req, res) => {
        const { logId, clearAll } = req.body;
        const logPath = path.join(__dirname, '..', 'data', 'afklog.json');

        if (clearAll) {
            fs.writeFileSync(logPath, JSON.stringify([], null, 2));
        } else if (logId) {
            let logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            logs = logs.filter(l => l.id !== logId);
            fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
        }

        res.redirect('/afk');
    });

    // --- COMMANDS Routes ---
    app.get('/commands', (req, res) => {
        if (!req.client.user) return res.send('Bot loading...');
        res.render('commands', {
            user: req.client.user,
            page: 'commands'
        });
    });

    app.get('/commands/rpc', (req, res) => {
        res.render('cmd_rpc', { user: req.client.user, page: 'commands' });
    });

    // RPC API
    app.get('/api/rpc', (req, res) => {
        const rpcManager = require('../commands/rpcManager');
        res.json(rpcManager.loadData(req.client));
    });

    app.post('/api/rpc', async (req, res) => {
        const rpcManager = require('../commands/rpcManager');
        const data = req.body;
        rpcManager.saveData(req.client, data);
        await rpcManager.setPresence(req.client, data);
        res.json({ success: true });
    });

    // Auto Reaction API
    app.get('/api/reaction', (req, res) => {
        const reactionManager = require('../commands/reactionManager');
        const data = reactionManager.loadData(req.client);

        // Enrich Servers
        const enrichedServers = (data.enabledServers || []).map(id => {
            const g = req.client.guilds.cache.get(id);
            return {
                id,
                name: g ? g.name : `Unknown Server`,
                icon: g ? g.iconURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png'
            };
        });

        // Enrich Channels
        const enrichedChannels = (data.enabledChannels || []).map(id => {
            const c = req.client.channels.cache.get(id);
            return {
                id,
                name: c ? c.name : `Unknown Channel`,
                guildName: c?.guild ? c.guild.name : 'Unknown Server',
                guildIcon: c?.guild ? c.guild.iconURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png'
            };
        });

        res.json({ ...data, enrichedServers, enrichedChannels });
    });

    app.post('/api/reaction', (req, res) => {
        const reactionManager = require('../commands/reactionManager');
        reactionManager.saveData(req.client, req.body);
        res.json({ success: true });
    });

    // Validation APIs
    app.post('/api/validate/guild', async (req, res) => {
        const { id } = req.body;
        try {
            const guild = req.client.guilds.cache.get(id);
            if (!guild) return res.status(404).json({ error: 'Server not found (Bot must be in it)' });
            res.json({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/validate/channel', async (req, res) => {
        const { id } = req.body;
        try {
            const channel = req.client.channels.cache.get(id);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });
            res.json({
                id: channel.id,
                name: channel.name,
                guildId: channel.guild?.id,
                guildName: channel.guild?.name || 'Direct Message',
                guildIcon: channel.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- AI Chat Routes ---
    app.get('/api/discord/tab/overview', async (req, res) => {
        try {
            if (!req.client) return res.status(401).json({ error: 'Connect a Discord account from the dashboard first.' });
            if (!req.client.user) return res.status(503).json({ error: 'Discord is still connecting. Try again in a moment.' });

            const guilds = req.client.guilds.cache.map((guild) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ dynamic: true, size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
                memberCount: guild.memberCount || 0
            }));

            const dms = Array.from(req.client.channels.cache.values())
                .filter((channel) => channel && ['DM', 'GROUP_DM', 1, 3].includes(channel.type))
                .map((channel) => ({
                    id: channel.id,
                    name: channel.name || channel.recipients?.map((user) => user.username).join(', ') || 'Direct Message',
                    type: 'dm',
                    icon: channel.recipient?.displayAvatarURL?.({ dynamic: true, size: 64 }) ||
                        channel.recipients?.first?.()?.displayAvatarURL?.({ dynamic: true, size: 64 }) ||
                        'https://cdn.discordapp.com/embed/avatars/0.png'
                }));

            res.json({
                account: {
                    tag: req.client.user.tag,
                    avatar: req.client.user.displayAvatarURL({ dynamic: true, size: 64 })
                },
                guilds,
                dms
            });
        } catch (error) {
            console.error('[KAIZEN] Failed to load Discord overview:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/discord/tab/channels/:guildId', async (req, res) => {
        try {
            if (!req.client) return res.status(401).json({ error: 'Connect a Discord account from the dashboard first.' });
            if (!req.client.user) return res.status(503).json({ error: 'Discord is still connecting. Try again in a moment.' });
            const guild = req.client.guilds.cache.get(req.params.guildId);
            if (!guild) return res.json([]);

            const channels = guild.channels.cache
                .filter((channel) => channel && [
                    'GUILD_TEXT', 'GUILD_NEWS', 'GUILD_VOICE', 'GUILD_STAGE_VOICE',
                    'GUILD_NEWS_THREAD', 'GUILD_PUBLIC_THREAD', 'GUILD_PRIVATE_THREAD',
                    'GUILD_FORUM', 'GUILD_MEDIA', 0, 2, 5, 10, 11, 12, 13, 15, 16
                ].includes(channel.type))
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((channel) => {
                    const canView = !!channel.permissionsFor(req.client.user)?.has('VIEW_CHANNEL');
                    return {
                        id: channel.id,
                        name: channel.name,
                        type: channel.type,
                        kind: ['GUILD_VOICE', 'GUILD_STAGE_VOICE', 2, 13].includes(channel.type) ? 'voice' : 'text',
                        private: !!channel.permissionOverwrites?.cache?.get(guild.roles.everyone.id)?.deny?.has('VIEW_CHANNEL'),
                        canView,
                        topic: channel.topic || '',
                        parentId: channel.parentId || null
                    };
                });

            res.json(channels);
        } catch (error) {
            console.error('[KAIZEN] Failed to load Discord channels:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/discord/tab/messages/:channelId', async (req, res) => {
        try {
            if (!req.client) return res.status(401).json({ error: 'Connect a Discord account from the dashboard first.' });
            if (!req.client.user) return res.status(503).json({ error: 'Discord is still connecting. Try again in a moment.' });
            const channel = await req.client.channels.fetch(req.params.channelId).catch(() => null);
            if (!channel || !('messages' in channel)) return res.json([]);
            if (channel.guild && !channel.permissionsFor(req.client.user)?.has('VIEW_CHANNEL')) {
                return res.status(403).json({ error: 'This channel is private. Your account does not have permission to view it.' });
            }

            const messages = await channel.messages.fetch({ limit: 25 }).catch(() => new Map());
            const items = Array.from(messages.values())
                .slice()
                .reverse()
                .map((message) => ({
                    id: message.id,
                    author: message.author?.username || 'Unknown',
                    avatar: message.author?.displayAvatarURL({ dynamic: true, size: 32 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
                    time: new Date(message.createdTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    content: message.content || (message.embeds?.length ? '[embed]' : '[attachment]')
                }));

            res.json(items);
        } catch (error) {
            console.error('[KAIZEN] Failed to load Discord messages:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/discord/tab/send-message', async (req, res) => {
        try {
            if (!req.client) return res.status(401).json({ success: false, message: 'Connect a Discord account from the dashboard first.' });
            if (!req.client.user) return res.status(503).json({ success: false, message: 'Discord is still connecting. Try again in a moment.' });

            const { channelId, content } = req.body;
            if (!channelId || !content || !String(content).trim()) {
                return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
            }

            const channel = await req.client.channels.fetch(channelId).catch(() => null);
            if (!channel || typeof channel.send !== 'function') {
                return res.status(404).json({ success: false, message: 'Channel not found or cannot send messages.' });
            }

            await channel.send(String(content).trim().slice(0, 2000));
            res.json({ success: true });
        } catch (error) {
            console.error('[KAIZEN] Failed to send Discord message:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    app.post('/api/discord/tab/delete-own-messages', async (req, res) => {
        try {
            if (!req.client || !req.client.user) {
                return res.status(401).json({ success: false, message: 'Connect a Discord account first.' });
            }

            const { channelId } = req.body;
            const count = Number(req.body.count);
            if (!channelId || !Number.isInteger(count) || count < 1 || count > 25) {
                return res.status(400).json({ success: false, message: 'Choose a channel and a count from 1 to 25.' });
            }

            const channel = await req.client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') {
                return res.status(404).json({ success: false, message: 'This channel cannot be accessed.' });
            }

            const recentMessages = await channel.messages.fetch({ limit: 100 });
            const ownMessages = Array.from(recentMessages.values())
                .filter((message) => message.author?.id === req.client.user.id)
                .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
                .slice(0, count);

            const deletedIds = [];
            for (const message of ownMessages) {
                await message.delete();
                deletedIds.push(message.id);
            }

            res.json({ success: true, deleted: ownMessages.length, deletedIds });
        } catch (error) {
            console.error('[KAIZEN] Failed to delete own Discord messages:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    app.get('/discord', (req, res) => {
        res.render('discord', {
            user: req.client ? req.client.user : null,
            page: 'discord'
        });
    });

    app.get('/ai', (req, res) => {
        const aiManager = require('../commands/aiManager');
        res.render('cmd_ai', {
            user: req.client.user,
            page: 'ai',
            hasNvidiaApiKey: aiManager.hasApiKey()
        });
    });

    app.post('/api/ai/key', async (req, res) => {
        const apiKey = String(req.body.apiKey || '').trim();
        if (!apiKey || apiKey.length > 4096) {
            return res.status(400).json({ success: false, message: 'Enter a valid NVIDIA API key.' });
        }

        const aiManager = require('../commands/aiManager');
        const verification = await aiManager.validateApiKey(apiKey);
        if (!verification.valid) {
            return res.status(verification.status).json({
                success: false,
                message: verification.message
            });
        }

        aiManager.setApiKey(apiKey);
        res.json({ success: true, message: 'NVIDIA API key verified and saved for this server session.' });
    });

    app.get('/api/ai', (req, res) => {
        const aiManager = require('../commands/aiManager');
        const data = aiManager.loadData(req.client);

        // Enrich Data for UI (Server/Channel/User names)
        // Similar to Reaction, we want to show nice lists

        const enrichedServers = (data.enabledServers || []).map(id => {
            const g = req.client.guilds.cache.get(id);
            return { id, name: g ? g.name : 'Unknown Server', icon: g ? g.iconURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png' };
        });
        const enrichedChannels = (data.enabledChannels || []).map(id => {
            const c = req.client.channels.cache.get(id);
            return { id, name: c ? c.name : 'Unknown Channel', guildName: c?.guild?.name || 'Unknown', guildIcon: c?.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' };
        });
        const enrichedGroupsAlways = (data.enabledGroups || []).map(id => {
            const c = req.client.channels.cache.get(id);
            let name = c ? c.name : 'Unknown Channel/Group';
            if (c && !name && c.recipients) name = c.recipients.map(u => u.username).join(', ');
            return { id, name, mode: 'always' };
        });
        const enrichedGroupsMention = (data.enabledGroupsMention || []).map(id => {
            const c = req.client.channels.cache.get(id);
            let name = c ? c.name : 'Unknown Channel/Group';
            if (c && !name && c.recipients) name = c.recipients.map(u => u.username).join(', ');
            return { id, name, mode: 'mention' };
        });
        const enrichedGroups = [...enrichedGroupsAlways, ...enrichedGroupsMention];

        const enrichedFreeWill = (data.freeWillChannels || []).map(item => {
            const id = typeof item === 'object' ? item.id : item;
            const delay = typeof item === 'object' ? item.delay : 0;
            const c = req.client.channels.cache.get(id);
            return { id, delay, name: c ? c.name : 'Unknown Channel', guildName: c?.guild?.name || 'Unknown', guildIcon: c?.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' };
        });
        const enrichedUsers = (data.dmUsers || []).map(id => {
            const u = req.client.users.cache.get(id); // Users might not be cached if not seen?
            // Selfbots usually have large cache if they are in servers.
            return { id, username: u ? u.username : 'Unknown User', avatar: u ? u.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png' };
        });

        const enrichedBlockedUsers = (data.blockedUsers || []).map(id => {
            const u = req.client.users.cache.get(id);
            return { id, username: u ? u.username : 'Unknown User', avatar: u ? u.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png' };
        });

        res.json({ ...data, enrichedServers, enrichedChannels, enrichedGroups, enrichedFreeWill, enrichedUsers, enrichedBlockedUsers });
    });

    app.post('/api/ai', (req, res) => {
        const aiManager = require('../commands/aiManager');
        aiManager.saveData(req.client, req.body);
        res.json({ success: true });
    });

    app.post('/api/validate/user', async (req, res) => {
        const { id } = req.body;
        try {
            const user = await req.client.users.fetch(id).catch(() => null);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({
                id: user.id,
                username: user.username,
                avatar: user.displayAvatarURL({ dynamic: true })
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Validate Channel OR User (Mixed) for Auto Msg
    app.post('/api/validate/mixed', async (req, res) => {
        const { id } = req.body;
        try {
            // Check Channel First
            const channel = await req.client.channels.fetch(id).catch(() => null);
            if (channel) {
                // Must be text-based to send messages
                if (!channel.isText()) return res.status(400).json({ error: 'Channel is not a text channel' });
                return res.json({
                    type: 'channel',
                    id: channel.id,
                    name: channel.name,
                    guildName: channel.guild?.name || 'DM',
                    icon: channel.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
                });
            }

            // Check User Second
            const user = await req.client.users.fetch(id).catch(() => null);
            if (user) {
                return res.json({
                    type: 'user',
                    id: user.id,
                    name: user.username,
                    guildName: 'Direct Message', // Display context as DM for clarity
                    icon: user.displayAvatarURL({ dynamic: true })
                });
            }

            res.status(404).json({ error: 'ID not found (Must be Channel or User)' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/commands/reaction', (req, res) => {
        res.render('cmd_reaction', { user: req.client.user, page: 'commands' });
    });
    app.get('/commands/mirror', (req, res) => {
        res.render('cmd_mirror', { user: req.client.user, page: 'commands' });
    });
    app.get('/commands/clipboard', (req, res) => {
        res.render('cmd_clipboard', { user: req.client.user, page: 'commands' });
    });

    // --- Auto Msg Routes ---
    app.get('/commands/auto-msg', (req, res) => {
        res.render('cmd_auto_msg', { user: req.client.user, page: 'commands' });
    });

    app.get('/api/auto-msg', (req, res) => {
        const autoMsg = require('../commands/autoMsg');
        res.json(autoMsg.getList(req.client));
    });

    app.post('/api/auto-msg', async (req, res) => {
        const autoMsg = require('../commands/autoMsg');
        const { action, channelId, message, interval, unit } = req.body;

        try {
            if (action === 'add') {
                // Validate permissions one last time logic?
                // The frontend checks, but backend should too ideally.
                // startTimer throws if invalid.
                await autoMsg.startTimer(req.client, channelId, message, interval, unit);
                autoMsg.addAutoMsg(req.client, channelId, message, interval, unit); // Save if start success
            } else if (action === 'remove') {
                autoMsg.removeAutoMsg(req.client, channelId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // --- Timed Msg Routes ---
    app.get('/commands/timed-msg', (req, res) => {
        res.render('cmd_timed_msg', { user: req.client.user, page: 'commands' });
    });

    app.get('/api/timed-msg', (req, res) => {
        const timedMsg = require('../commands/timedMsg');
        res.json(timedMsg.getList(req.client));
    });

    app.post('/api/timed-msg', async (req, res) => {
        const timedMsg = require('../commands/timedMsg');
        const { action, id, channelId, message, timestamp, timezone } = req.body;

        try {
            if (action === 'add') {
                const item = timedMsg.addTimedMsg(req.client, channelId, message, timestamp, timezone);
                res.json({ success: true, item });
            } else if (action === 'remove') {
                timedMsg.removeTimedMsg(req.client, id);
                res.json({ success: true });
            } else {
                res.status(400).json({ error: 'Invalid action' });
            }
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.get('/api/clipboard', (req, res) => {
        const clipboardManager = require('../commands/clipboardManager');
        res.json(clipboardManager.loadData(req.client));
    });

    app.post('/api/clipboard', (req, res) => {
        const clipboardManager = require('../commands/clipboardManager');
        const { action, trigger, response } = req.body;

        if (action === 'add') {
            clipboardManager.addTrigger(req.client, trigger, response);
        } else if (action === 'remove') {
            clipboardManager.removeTrigger(req.client, trigger);
        }
        res.json({ success: true });
    });

    app.get('/commands/allowed', (req, res) => {
        res.render('cmd_allowed', { user: req.client.user, page: 'commands' });
    });

    // --- Allowed ID Routes ---
    app.get('/api/allowed', async (req, res) => {
        const allowedManager = require('../commands/allowedManager');
        const data = allowedManager.loadData(req.client);

        // Enrich user data
        const enrichedUsers = await Promise.all(data.allowedUsers.map(async (id) => {
            const u = await req.client.users.fetch(id).catch(() => null);
            return {
                id,
                username: u ? u.username : 'Unknown User',
                avatar: u ? u.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png'
            };
        }));

        res.json({ allowedUsers: enrichedUsers });
    });

    app.post('/api/allowed', (req, res) => {
        const { action, id } = req.body;
        const allowedManager = require('../commands/allowedManager');

        if (action === 'add') {
            allowedManager.addAllowedUser(req.client, id);
        } else if (action === 'remove') {
            allowedManager.removeAllowedUser(req.client, id);
        }
        res.json({ success: true });
    });

    // --- Mirror Routes ---
    app.get('/api/mirror', (req, res) => {
        const mirrorManager = require('../commands/mirrorManager');
        const list = mirrorManager.getActiveMirrors(req.client) || [];
        const enriched = list.map(m => {
            const s = req.client.channels.cache.get(m.sourceId);
            const t = req.client.channels.cache.get(m.targetId);
            return {
                ...m,
                sourceName: s ? `#${s.name} (${s.guild?.name || 'DM'})` : m.sourceId,
                targetName: t ? `#${t.name} (${t.guild?.name || 'DM'})` : m.targetId,
                sourceIcon: s?.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
                targetIcon: t?.guild?.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'
            };
        });
        res.json(enriched);
    });

    app.post('/api/mirror', async (req, res) => {
        const { sourceId, targetId, mode } = req.body;
        const mirrorManager = require('../commands/mirrorManager');
        try {
            await mirrorManager.startMirror(req.client, sourceId, targetId, mode);
            res.json({ success: true });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.delete('/api/mirror', async (req, res) => {
        const { sourceId } = req.body;
        const mirrorManager = require('../commands/mirrorManager');
        await mirrorManager.stopMirror(req.client, sourceId);
        res.json({ success: true });
    });

    app.post('/api/validate/mirror-channel', async (req, res) => {
        const { id, checkWebhook } = req.body;
        try {
            const channel = await req.client.channels.fetch(id).catch(() => null);
            if (!channel) return res.status(404).json({ error: 'Channel not found/Not Visible' });

            if (!channel.isText()) return res.status(400).json({ error: 'Not a text channel' });

            // Selfbots have full user perms, just check if we can view/send
            // But channel.permissionsFor works if in guild.
            if (channel.guild) {
                const permissions = channel.permissionsFor(req.client.user);

                // If checking Target, ensure we can SEND
                const { type } = req.body;
                if (type === 'target') {
                    if (!permissions.has('SEND_MESSAGES')) return res.status(403).json({ error: 'Missing SEND_MESSAGES permission' });
                } else {
                    // Source: just need to view
                    if (!permissions.has('VIEW_CHANNEL')) return res.status(403).json({ error: 'Missing VIEW_CHANNEL permission' });
                }

                if (checkWebhook) {
                    if (!permissions.has('MANAGE_WEBHOOKS')) return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission (Required for Clone)' });
                }
            } else {
                // DM - always can send if friend?
                // Webhooks don't work in DMs.
                if (checkWebhook) return res.status(400).json({ error: 'Clone Mode (Webhooks) not supported in DMs' });
            }

            res.json({
                success: true,
                name: channel.name || 'DM',
                guildName: channel.guild?.name || 'Direct Message',
                icon: channel.guild?.iconURL({ dynamic: true }) || channel.recipient?.displayAvatarURL({ dynamic: true })
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/commands/welcomer', (req, res) => {
        res.render('cmd_welcomer', { user: req.client.user, page: 'commands' });
    });

    app.get('/api/welcomer', async (req, res) => {
        const welcomerManager = require('../commands/welcomerManager');
        const data = welcomerManager.loadData(req.client);
        const setups = data.welcomeSetups || {};

        // Enrich server info
        const enrichedList = [];
        for (const [guildId, val] of Object.entries(setups)) {
            const guild = req.client.guilds.cache.get(guildId);
            let channelName = "Unknown Channel";
            if (guild) {
                const c = guild.channels.cache.get(val.channelId);
                if (c) channelName = c.name;
            }

            enrichedList.push({
                guildId,
                guildName: guild ? guild.name : `Server ${guildId}`,
                icon: guild && guild.iconURL() ? guild.iconURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                channelId: val.channelId,
                channelName: channelName,
                template: val.template,
                background: val.background,
                textcolor: val.textcolor,
                welcomeType: val.welcomeType || 'card',
                textMessage: val.textMessage || 'hey {user} welcome to the {server} you are {count} member',
                cardMessage: val.cardMessage || 'WELCOME TO {server}\n{user}\nMember #{count}'
            });
        }
        const config = data.config || { textcolor: 'white', welcomeType: 'card', textMessage: 'hey {user} welcome to the {server} you are {count} member', cardMessage: 'WELCOME TO {server}\n{user}\nMember #{count}' };
        res.json({ setups: enrichedList, config });
    });

    app.post('/api/welcomer', (req, res) => {
        const welcomerManager = require('../commands/welcomerManager');
        const { action, guildId, channelId, template, background, textcolor, welcomeType, textMessage, cardMessage } = req.body;

        try {
            if (action === 'add') {
                welcomerManager.addSetup(req.client, guildId, channelId, template, background, textcolor, welcomeType, textMessage, cardMessage);
            } else if (action === 'remove') {
                welcomerManager.removeSetup(req.client, guildId);
            } else if (action === 'saveConfig') {
                const data = welcomerManager.loadData(req.client);
                data.config = { textcolor, welcomeType, textMessage, cardMessage };

                // Update all existing setups automatically
                if (!data.welcomeSetups) data.welcomeSetups = {};
                for (let gid of Object.keys(data.welcomeSetups)) {
                    data.welcomeSetups[gid].textcolor = textcolor;
                    data.welcomeSetups[gid].welcomeType = welcomeType;
                    data.welcomeSetups[gid].textMessage = textMessage;
                    data.welcomeSetups[gid].cardMessage = cardMessage;
                }
                welcomerManager.saveData(req.client, data);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- RECORDER Routes ---
    app.get('/commands/recorder', (req, res) => {
        res.render('cmd_recorder', { user: req.client.user, page: 'commands' });
    });

    app.get('/api/recorder/status', (req, res) => {
        const recManager = require('../commands/rec');
        const { getVoiceConnection } = require('@discordjs/voice');
        let recordingStatus = false;
        let recordingTime = 0;
        let activeGuildId = null;
        let channelId = null;
        let guildName = '';
        let channelName = '';
        let guildIcon = '';

        for (const [gid, session] of recManager.activeSessions.entries()) {
            activeGuildId = gid;
            channelId = session.channelId;
            guildName = session.guildName;
            channelName = session.channelName;
            const g = req.client.guilds.cache.get(gid);
            guildIcon = g ? g.iconURL({ dynamic: true }) : '';
            recordingStatus = true;
            recordingTime = Date.now() - session.recordingStartTime;
            break;
        }

        if (!activeGuildId) {
            // Check if connected to any VC
            for (const [gId, guild] of req.client.guilds.cache.entries()) {
                const member = guild.members.cache.get(req.client.user.id);
                if (member && member.voice && member.voice.channelId) {
                    activeGuildId = gId;
                    channelId = member.voice.channelId;
                    guildName = guild.name;
                    channelName = member.voice.channel.name;
                    guildIcon = guild.iconURL({ dynamic: true }) || '';
                    break;
                }
            }
        }

        res.json({
            isConnectedToVoice: !!activeGuildId,
            isPlayingRecording: recManager.playbackPlayers.has(activeGuildId),
            isRecording: recordingStatus,
            activeGuildId,
            channelId,
            guildName,
            channelName,
            guildIcon,
            recordingTime,
            recordings: recManager.loadMeta()
        });
    });

    app.post('/api/recorder/join', async (req, res) => {
        const recManager = require('../commands/rec');
        try {
            await recManager.joinTargetVC(req.client, req.body.guildId, req.body.channelId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/recorder/leave', (req, res) => {
        const { getVoiceConnection } = require('@discordjs/voice');
        const conn = getVoiceConnection(req.body.guildId);
        if (conn) {
            try { conn.destroy(); } catch (e) { }
        }
        res.json({ success: true });
    });

    app.post('/api/recorder/start', async (req, res) => {
        const recManager = require('../commands/rec');
        try {
            await recManager.startRecordingDirect(req.client, req.body.guildId, req.body.channelId, "Dashboard");
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/recorder/stop', async (req, res) => {
        const recManager = require('../commands/rec');
        try {
            await recManager.stopRecordingDirect(req.client, req.body.guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/recorder/play', async (req, res) => {
        const recManager = require('../commands/rec');
        try {
            await recManager.playRecordingDirect(req.client, req.body.guildId, req.body.filename);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/recorder/stopplay', (req, res) => {
        const recManager = require('../commands/rec');
        try {
            recManager.stopPlaybackDirect(req.body.guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/recorder/delete', (req, res) => {
        const recManager = require('../commands/rec');
        try {
            recManager.deleteRecordingDirect(req.body.filename);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/commands/:category', (req, res) => {
        const category = req.params.category;
        res.render('commands_sub', {
            user: req.client.user,
            page: 'commands',
            category: category.charAt(0).toUpperCase() + category.slice(1)
        });
    });

    // --- MUSIC Routes ---

    app.get('/music', (req, res) => {
        if (!req.client.user) return res.send('Bot loading...');
        res.render('music', {
            user: req.client.user,
            page: 'music'
        });
    });

    app.get('/api/music/status', (req, res) => {
        const queues = req.client.queueManager ? req.client.queueManager.getAll() : new Map();

        const getCover = (info) => {
            if (info.sourceName === 'youtube' || info.uri.includes('youtube')) {
                return `https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg`;
            } else if (info.artworkUrl) {
                return info.artworkUrl;
            }
            return 'https://i.imgur.com/2ce2t5e.png';
        };

        let musicData = {
            connected: !!req.client.lavalink,
            isPlaying: false,
            guildName: 'No Guild',
            guildIcon: null,
            channelName: '',
            nowPlaying: null,
            position: 0,
            duration: 0,
            volume: 100,
            loop: 'none',
            autoplay: false,
            queue: [],
            queueCount: 0
        };

        // Get first active queue
        for (const [guildId, queue] of queues) {
            if (queue.nowPlaying) {
                const guild = req.client.guilds.cache.get(guildId);
                const voiceState = req.client.lavalinkVoiceStates ? req.client.lavalinkVoiceStates[guildId] : null; // Custom voiceStates storage
                // OR check req.client.guilds.cache.get(guildId).me.voice.channel

                musicData.activeGuildId = guildId;
                musicData.isPlaying = true;
                musicData.guildName = guild ? guild.name : `Guild ${guildId}`;
                musicData.guildIcon = guild ? guild.iconURL({ dynamic: true, size: 128 }) : null;
                musicData.volume = queue.volume !== undefined ? queue.volume : 100;
                musicData.loop = queue.loop || 'none';
                musicData.autoplay = queue.autoplay || false;

                // Try to find channel name
                // queue doesn't store channelId? Lavalink might. 
                // We'll leave channelName generic or try to find where bot is
                if (guild && guild.me && guild.me.voice && guild.me.voice.channel) {
                    musicData.channelName = guild.me.voice.channel.name;
                }

                const info = queue.nowPlaying.info;
                let cover = 'https://i.imgur.com/2ce2t5e.png'; // Fallback

                if (info.sourceName === 'youtube' || info.uri.includes('youtube')) {
                    cover = `https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg`;
                } else if (info.artworkUrl) {
                    cover = info.artworkUrl;
                }

                musicData.nowPlaying = {
                    title: info.title,
                    author: info.author,
                    cover: cover,
                    url: info.uri
                };

                musicData.duration = info.length;
                musicData.position = queue.position || 0;

                // Adjust position estimate
                if (queue.lastUpdate && !queue.paused) {
                    const diff = Date.now() - queue.lastUpdate;
                    musicData.position += diff;
                    if (musicData.position > musicData.duration) musicData.position = musicData.duration;
                }

                musicData.queue = queue.songs.map(song => ({
                    title: song.info.title,
                    author: song.info.author,
                    uri: song.info.uri,
                    cover: getCover(song.info)
                }));
                musicData.queueCount = queue.songs.length;
                break;
            }
        }

        if (!musicData.isPlaying) {
            for (const [id, guild] of req.client.guilds.cache) {
                if (guild.me && guild.me.voice && guild.me.voice.channelId) {
                    musicData.activeGuildId = id;
                    musicData.isConnectedToVoice = true;
                    musicData.guildName = guild.name;
                    musicData.guildIcon = guild.iconURL ? guild.iconURL({ dynamic: true, size: 128 }) : null;
                    if (guild.me.voice.channel) musicData.channelName = guild.me.voice.channel.name;
                    break;
                }
            }
        }

        res.json(musicData);
    });

    app.post('/api/music/stop', async (req, res) => {
        try {
            const queues = req.client.queueManager ? req.client.queueManager.getAll() : new Map();
            let stopped = false;

            for (const [guildId, queue] of queues) {
                if (queue.nowPlaying) {
                    if (req.client.lavalink) {
                        await req.client.lavalink.destroyPlayer(guildId);
                    }
                    req.client.queueManager.delete(guildId);

                    // Try to disconnect from voice
                    const { getVoiceConnection } = require('@discordjs/voice');
                    const connection = getVoiceConnection(guildId);
                    if (connection) {
                        connection.destroy();
                    }

                    stopped = true;
                }
            }

            if (stopped) {
                res.json({ success: true, message: 'Music stopped' });
            } else {
                res.json({ success: false, message: 'No music is playing' });
            }
        } catch (error) {
            console.error('Error stopping music:', error);
            res.json({ success: false, message: error.message });
        }
    });

    app.post('/api/music/skip', async (req, res) => {
        try {
            const queues = req.client.queueManager ? req.client.queueManager.getAll() : new Map();
            for (const [guildId, queue] of queues) {
                if (queue.nowPlaying) {
                    if (queue.autoplay && queue.songs.length < 5) await req.client.queueManager.fillAutoplayQueue(req.client, guildId);
                    const nextSong = req.client.queueManager.getNext(guildId);

                    if (!nextSong) {
                        if (req.client.lavalink) await req.client.lavalink.destroyPlayer(guildId);
                        req.client.queueManager.delete(guildId);
                    } else {
                        if (queue.nowPlaying) queue.history.push(queue.nowPlaying);
                        queue.nowPlaying = nextSong;
                        queue.position = 0;
                        queue.lastUpdate = Date.now();
                        await req.client.lavalink.updatePlayer(guildId, nextSong, req.client.lavalinkVoiceStates[guildId] || {});
                    }
                    return res.json({ success: true });
                }
            }
            res.json({ success: false, message: 'No music playing' });
        } catch (e) { console.error(e); res.json({ success: false }); }
    });

    app.post('/api/music/previous', async (req, res) => {
        try {
            const queues = req.client.queueManager ? req.client.queueManager.getAll() : new Map();
            for (const [guildId, queue] of queues) {
                if (queue.nowPlaying && queue.history.length > 0) {
                    const prev = queue.history.pop();
                    queue.songs.unshift(queue.nowPlaying);
                    queue.nowPlaying = prev;
                    queue.position = 0;
                    queue.lastUpdate = Date.now();
                    await req.client.lavalink.updatePlayer(guildId, prev, req.client.lavalinkVoiceStates[guildId] || {});
                    return res.json({ success: true });
                }
            }
            res.json({ success: false, message: 'No previous song' });
        } catch (e) { console.error(e); res.json({ success: false }); }
    });

    app.post('/api/music/volume', async (req, res) => {
        const { guildId, volume } = req.body;
        try {
            const queue = req.client.queueManager ? req.client.queueManager.get(guildId) : null;
            if (queue && req.client.lavalink) {
                const vol = parseInt(volume);
                if (!isNaN(vol) && vol >= 0 && vol <= 500) {
                    queue.volume = vol;
                    await req.client.lavalink.updatePlayerProperties(guildId, { volume: vol });
                    return res.json({ success: true, volume: vol });
                }
            }
            res.json({ success: false, message: 'No active player or invalid volume' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/music/loop', async (req, res) => {
        const { guildId } = req.body;
        try {
            const queue = req.client.queueManager ? req.client.queueManager.get(guildId) : null;
            if (queue && req.client.lavalink) {
                if (queue.loop === 'none') queue.loop = 'track';
                else if (queue.loop === 'track') queue.loop = 'queue';
                else if (queue.loop === 'queue') queue.loop = 'none';
                return res.json({ success: true, loop: queue.loop });
            }
            res.json({ success: false, message: 'No active player' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/music/autoplay', async (req, res) => {
        const { guildId } = req.body;
        try {
            const queue = req.client.queueManager ? req.client.queueManager.get(guildId) : null;
            if (queue && req.client.lavalink) {
                queue.autoplay = !queue.autoplay;
                if (queue.autoplay) {
                    await req.client.queueManager.fillAutoplayQueue(req.client, guildId);
                }
                return res.json({ success: true, autoplay: queue.autoplay });
            }
            res.json({ success: false, message: 'No active player' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/music/seek', async (req, res) => {
        const { guildId, amount } = req.body;
        try {
            const queue = req.client.queueManager ? req.client.queueManager.get(guildId) : null;
            if (queue && req.client.lavalink && queue.nowPlaying) {
                let newPosition = queue.position + amount;

                if (newPosition < 0) newPosition = 0;
                if (newPosition > queue.nowPlaying.info.length) {
                    newPosition = queue.nowPlaying.info.length - 1000;
                    if (newPosition < 0) newPosition = 0;
                }

                await req.client.lavalink.updatePlayerProperties(guildId, { position: newPosition });
                queue.position = newPosition;
                queue.lastUpdate = Date.now();
                return res.json({ success: true, position: newPosition });
            }
            res.json({ success: false, message: 'No active player' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // fs and path already required at the top

    app.get('/api/music/playlists', (req, res) => {
        try {
            const pltPath = path.join(__dirname, '../data/playlists.json');
            if (fs.existsSync(pltPath)) {
                const data = JSON.parse(fs.readFileSync(pltPath, 'utf8'));
                res.json({ success: true, playlists: Object.keys(data) });
            } else {
                res.json({ success: true, playlists: [] });
            }
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/music/playlist/load', async (req, res) => {
        const { guildId, name } = req.body;
        try {
            const pltPath = path.join(__dirname, '../data/playlists.json');
            if (!fs.existsSync(pltPath)) return res.json({ success: false, message: 'No playlists found' });

            const data = JSON.parse(fs.readFileSync(pltPath, 'utf8'));
            const playlist = data[name];
            if (!playlist || playlist.length === 0) return res.json({ success: false, message: 'Playlist not found or empty' });

            const voiceState = req.client.lavalinkVoiceStates ? req.client.lavalinkVoiceStates[guildId] : null;
            if (!voiceState || !voiceState.token) {
                return res.json({ success: false, message: 'Bot not connected to voice in this server' });
            }

            let queue = req.client.queueManager ? req.client.queueManager.get(guildId) : null;
            if (!queue) {
                queue = req.client.queueManager.create(guildId);
            }

            let added = 0;
            for (const song of playlist) {
                try {
                    const lRes = await req.client.lavalink.loadTracks(song.uri);
                    let trackToLoad;

                    if (lRes.loadType === 'track') trackToLoad = lRes.data;
                    else if (lRes.loadType === 'playlist') trackToLoad = lRes.data.tracks[0];
                    else if (lRes.loadType === 'search') trackToLoad = lRes.data[0];

                    if (trackToLoad) {
                        req.client.queueManager.addSong(guildId, trackToLoad);
                        added++;
                    }
                } catch (e) {
                    console.error('Error loading fav track:', e);
                }
            }

            if (added > 0 && !queue.nowPlaying && req.client.queueManager) {
                const nextSong = req.client.queueManager.getNext(guildId);
                if (nextSong) {
                    queue.nowPlaying = nextSong;
                    await req.client.lavalink.updatePlayer(guildId, nextSong, voiceState, {
                        volume: queue.volume,
                        filters: queue.filters
                    });
                }
            }

            if (queue && queue.autoplay && queue.songs.length < 5) {
                await req.client.queueManager.fillAutoplayQueue(req.client, guildId);
            }

            res.json({ success: true, added });
        } catch (e) {
            console.error('Playlist load API error:', e);
            res.json({ success: false, message: e.message });
        }
    });




    app.get('/api/discord/guilds', (req, res) => {
        try {
            const guilds = req.client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.iconURL() }));
            res.json(guilds);
        } catch (e) { res.json([]); }
    });

    app.get('/api/discord/channels/:guildId', (req, res) => {
        try {
            const guild = req.client.guilds.cache.get(req.params.guildId);
            if (!guild) return res.json([]);
            const channels = guild.channels.cache
                .filter(c => c.type === 'GUILD_VOICE' || c.type === 'GUILD_STAGE_VOICE')
                .map(c => ({ id: c.id, name: c.name }));
            res.json(channels);
        } catch (e) { res.json([]); }
    });

    app.post('/api/music/join', async (req, res) => {
        const { guildId, channelId } = req.body;
        try {
            const payload = { op: 4, d: { guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: false } };
            if (req.client.ws && req.client.ws.shards) req.client.ws.shards.get(0).send(payload);
            else req.client.ws.broadcast(payload);
            res.json({ success: true });
        } catch (e) { console.error(e); res.json({ success: false }); }
    });

    app.post('/api/music/leave', async (req, res) => {
        const { guildId } = req.body;
        try {
            req.client.queueManager.delete(guildId);
            if (req.client.lavalink) await req.client.lavalink.destroyPlayer(guildId);

            const payload = { op: 4, d: { guild_id: guildId, channel_id: null } };
            if (req.client.ws && req.client.ws.shards) req.client.ws.shards.get(0).send(payload);
            else req.client.ws.broadcast(payload);

            res.json({ success: true });
        } catch (e) { console.error(e); res.json({ success: false }); }
    });

    app.post('/api/music/play', async (req, res) => {
        const { guildId, query } = req.body;
        if (!guildId || !query) return res.json({ success: false, message: 'Missing args' });

        try {
            const { playLogic } = require('../commands/play');
            const result = await playLogic(req.client, guildId, query);
            res.json(result);
        } catch (e) { console.error(e); res.json({ success: false, message: e.message }); }
    });

    // --- SERVER CLONER ROUTES ---

    // In-memory state for Cloner
    const clonerState = {
        instance: null,
        isRunning: false,
        logs: [],
        sourceId: '',
        targetId: '',
        stats: {}
    };

    app.get('/server-cloner', (req, res) => {
        if (!req.client.user) return res.send('Bot loading...');
        res.render('server-cloner', {
            user: req.client.user,
            page: 'cloner'
        });
    });

    app.get('/api/cloner/status', (req, res) => {
        res.json({
            isRunning: clonerState.isRunning,
            logs: clonerState.logs,
            stats: clonerState.stats
        });
    });

    app.post('/api/cloner/fetch', async (req, res) => {
        const { guildId } = req.body;
        try {
            const guild = req.client.guilds.cache.get(guildId);
            if (!guild) return res.json({ success: false, message: 'Guild not found (Bot must be a member)' });

            const member = await guild.members.fetch(req.client.user.id).catch(() => null);
            const isAdmin = member ? member.permissions.has('ADMINISTRATOR') : false;

            res.json({
                success: true,
                name: guild.name,
                icon: guild.iconURL({ dynamic: true, size: 128 }),
                isAdmin: isAdmin,
                isOwner: guild.ownerId === req.client.user.id
            });
        } catch (e) { res.json({ success: false, message: e.message }); }
    });

    app.post('/api/cloner/start', async (req, res) => {
        if (clonerState.isRunning) return res.json({ success: false, message: 'Already running' });

        const { sourceId, targetId, options } = req.body;

        clonerState.isRunning = true;
        clonerState.logs = [];
        clonerState.stats = {};
        clonerState.sourceId = sourceId;
        clonerState.targetId = targetId;

        clonerState.logs.push(`[${new Date().toLocaleTimeString()}] Request received. Initializing...`);

        const ServerCloner = require('../cloner/ServerCloner');
        const cloner = new ServerCloner(req.client, (msg) => {
            clonerState.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
            if (clonerState.logs.length > 500) clonerState.logs.shift();
        });

        clonerState.instance = cloner;

        // Run in background
        cloner.cloneServer(sourceId, targetId, options)
            .then(stats => {
                clonerState.stats = stats;
                clonerState.isRunning = false;
                clonerState.instance = null;
                clonerState.logs.push(`[${new Date().toLocaleTimeString()}] Process completed successfully.`);
            })
            .catch(err => {
                clonerState.isRunning = false;
                clonerState.instance = null;
                // If stopped manually, we might have already logged "stopped by user" in cloner, but let's be safe
                if (err.message !== 'Cloning stopped by user.') { // Assuming standard error if any
                    clonerState.logs.push(`[${new Date().toLocaleTimeString()}] Error: ${err.message}`);
                }
            });

        res.json({ success: true });
    });

    app.post('/api/cloner/stop', (req, res) => {
        if (clonerState.instance) {
            clonerState.instance.stop();
            // Logging is handled inside Cloner stop() -> log()
            res.json({ success: true, message: 'Stop signal sent.' });
        } else {
            res.json({ success: false, message: 'No active process' });
        }
    });

    return app;
};
