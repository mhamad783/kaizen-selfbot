const { WebhookClient } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');

const clientMirrors = new Map();

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'mirror_config.json');
}

function getActiveMirrorsMap(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    if (!clientMirrors.has(folder)) {
        clientMirrors.set(folder, new Map());
    }
    return clientMirrors.get(folder);
}

function loadData(client) {
    const file = getFile(client);
    if (!fs.existsSync(file)) {
        const folder = client && client.dataFolder ? client.dataFolder : 'data';
        const dataDir = path.join(__dirname, '..', folder);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({}, null, 4));
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveData(client) {
    const data = {};
    const activeMirrors = getActiveMirrorsMap(client);
    for (const [sourceId, config] of activeMirrors.entries()) {
        data[sourceId] = {
            sourceId: config.sourceId,
            targetId: config.targetId,
            mode: config.mode,
            webhook: config.webhook,
            startTime: config.startTime
        };
    }
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const dataDir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(getFile(client), JSON.stringify(data, null, 4));
}

async function initialize(client) {
    console.log("[Mirror System] Initializing for", client.user?.tag || "Unknown");
    const saved = loadData(client);
    const activeMirrors = getActiveMirrorsMap(client);

    for (const [sourceId, config] of Object.entries(saved)) {
        try {
            await startMirror(client, config.sourceId, config.targetId, config.mode, config.webhook, true);
        } catch (e) {
            console.error(`[Mirror] Failed to restore mirror for ${sourceId}:`, e.message);
        }
    }

    client.on('messageCreate', async (message) => {
        const activeMirrors = getActiveMirrorsMap(client);
        if (!activeMirrors.has(message.channel.id)) return;
        const config = activeMirrors.get(message.channel.id);

        if (message.author.id === client.user.id) return;
        if (message.author.bot) return;
        if (message.system) return;

        try {
            await processMirror(client, message, config);
        } catch (e) {
            console.error(`[Mirror] Error processing message from ${message.channel.id}:`, e.message);
        }
    });

    console.log(`[Mirror System] Restored ${activeMirrors.size} mirrors.`);
}

async function startMirror(client, sourceId, targetId, mode, webhookData = null, isRestoring = false) {
    const activeMirrors = getActiveMirrorsMap(client);
    if (activeMirrors.has(sourceId)) {
        throw new Error("Mirror already active for this source channel.");
    }

    const sourceChannel = await client.channels.fetch(sourceId).catch(() => null);
    const targetChannel = await client.channels.fetch(targetId).catch(() => null);

    if (!sourceChannel) throw new Error("Invalid Source Channel.");
    if (!targetChannel) throw new Error("Invalid Target Channel.");

    let webhookInfo = webhookData;
    let webhookClient = null;

    if (mode === 'webhook') {
        if (!webhookInfo) {
            const hooks = await targetChannel.fetchWebhooks().catch(() => null);
            let hook = hooks ? hooks.find(h => h.token) : null;

            if (!hook) {
                try {
                    hook = await targetChannel.createWebhook('Mirror Bot', {
                        avatar: client.user.displayAvatarURL(),
                        reason: 'Mirror System'
                    });
                } catch (e) {
                    throw new Error("Failed to create Webhook. Check Permissions in Target Channel.");
                }
            }
            webhookInfo = { id: hook.id, token: hook.token };
        }

        webhookClient = new WebhookClient({ id: webhookInfo.id, token: webhookInfo.token });
    }

    const config = {
        sourceId,
        targetId,
        mode,
        webhook: webhookInfo,
        webhookClient,
        startTime: new Date().toISOString()
    };

    activeMirrors.set(sourceId, config);

    if (!isRestoring) {
        saveData(client);
    }
}

async function stopMirror(client, sourceId) {
    const activeMirrors = getActiveMirrorsMap(client);
    if (!activeMirrors.has(sourceId)) return false;
    activeMirrors.delete(sourceId);
    saveData(client);
    return true;
}

// WORKAROUND: Send attachment URLs as text content so they embed
async function processMirror(client, message, config) {
    const { mode, targetId, webhookClient } = config;

    if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) return;

    // Collect attachment URLs
    const attachmentUrls = [];
    if (message.attachments.size > 0) {
        message.attachments.forEach(attachment => {
            attachmentUrls.push(attachment.url);
        });
    }

    // Extract CDN links from content
    const cdnLinks = (message.content || '').match(/https:\/\/cdn\.discordapp\.com\/[^\s]+/g) || [];
    cdnLinks.forEach(link => {
        if (!attachmentUrls.includes(link)) {
            attachmentUrls.push(link);
        }
    });

    const embeds = message.embeds.length > 0 ? message.embeds : [];

    // Build content: original message + attachment URLs (so they auto-embed)
    let finalContent = message.content || '';
    if (attachmentUrls.length > 0) {
        // Add URLs to content separated by newlines
        const urlText = attachmentUrls.join('\n');
        finalContent = finalContent ? `${finalContent}\n${urlText}` : urlText;
    }

    const webhookPayload = {
        username: message.author.username,
        avatarURL: message.author.displayAvatarURL(),
        embeds: embeds
    };

    if (finalContent.trim()) {
        webhookPayload.content = finalContent;
    }

    if (mode === 'webhook' && webhookClient) {
        try {
            await webhookClient.send(webhookPayload);
        } catch (e) {
            console.error(`[Mirror] Webhook Error:`, e.message);
        }
    } else {
        const targetChannel = await client.channels.fetch(targetId).catch(() => null);
        if (targetChannel) {
            try {
                await targetChannel.send(webhookPayload);
            } catch (e) {
                console.error(`[Mirror] Send Error:`, e.message);
            }
        }
    }
}

function getActiveMirrors(client) {
    const list = [];
    const activeMirrors = getActiveMirrorsMap(client);
    for (const [sourceId, config] of activeMirrors.entries()) {
        list.push({
            sourceId,
            targetId: config.targetId,
            mode: config.mode,
            startTime: config.startTime
        });
    }
    return list;
}

module.exports = { initialize, startMirror, stopMirror, getActiveMirrors, loadData };
