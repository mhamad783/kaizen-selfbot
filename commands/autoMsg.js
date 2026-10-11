const fs = require('fs');
const path = require('path');

let clientTimers = new Map();

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'auto_msg.json');
}

function getActiveTimersMap(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    if (!clientTimers.has(folder)) {
        clientTimers.set(folder, new Map());
    }
    return clientTimers.get(folder);
}

// Helper to calculate milliseconds
function getMilliseconds(val, unit) {
    val = parseInt(val);
    if (isNaN(val)) return null;
    switch (unit) {
        case 'second': return val * 1000;
        case 'minute': return val * 60 * 1000;
        case 'hour': return val * 60 * 60 * 1000;
        case 'day': return val * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

function loadData(client) {
    const file = getFile(client);
    if (!fs.existsSync(file)) {
        const folder = client && client.dataFolder ? client.dataFolder : 'data';
        const dataDir = path.join(__dirname, '..', folder);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify([], null, 4));
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveData(client, data) {
    fs.writeFileSync(getFile(client), JSON.stringify(data, null, 4));
}

async function initialize(client) {
    console.log("[Auto Msg] Initializing for", client.user?.tag || "Unknown");
    const saved = loadData(client);

    let count = 0;
    for (const item of saved) {
        try {
            await startTimer(client, item.channelId, item.message, item.interval, item.unit);
            count++;
        } catch (e) {
            console.error(`[Auto Msg] Failed to restore for channel ${item.channelId}:`, e.message);
        }
    }
    console.log(`[Auto Msg] Restored ${count} timers.`);
}

async function startTimer(client, channelId, messageContent, intervalVal, unit) {
    // Clear existing timer for this channel/user if any
    stopTimer(client, channelId);

    const ms = getMilliseconds(intervalVal, unit);
    if (!ms || ms < 1000) throw new Error("Invalid interval (Min 1 second)");

    let target;
    let targetType = 'channel';

    // Try Channel First
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            if (channel.guild) {
                if (!channel.permissionsFor(client.user).has('SEND_MESSAGES')) {
                    throw new Error("Missing SEND_MESSAGES permission in Channel");
                }
            }
            target = channel;
        }
    } catch (e) { }

    // Try User Second (if not channel)
    if (!target) {
        try {
            const user = await client.users.fetch(channelId).catch(() => null);
            if (user) {
                target = user; // Users have .send() method too
                targetType = 'user';
            }
        } catch (e) { }
    }

    if (!target) throw new Error("ID not found (Must be a valid Channel ID or User ID)");

    // Interval Function
    const timer = setInterval(async () => {
        try {
            await target.send(messageContent);
        } catch (e) {
            console.error(`[Auto Msg] Failed to send to ${targetType} ${channelId}:`, e.message);
        }
    }, ms);

    const activeTimers = getActiveTimersMap(client);
    activeTimers.set(channelId, timer);
    return true;
}

function stopTimer(client, channelId) {
    const activeTimers = getActiveTimersMap(client);
    if (activeTimers.has(channelId)) {
        clearInterval(activeTimers.get(channelId));
        activeTimers.delete(channelId);
    }
}

// API Methods
function addAutoMsg(client, channelId, message, interval, unit) {
    const list = loadData(client);
    // Check duplication? Allow update.
    const index = list.findIndex(x => x.channelId === channelId);

    if (index >= 0) {
        list[index] = { channelId, message, interval, unit };
    } else {
        list.push({ channelId, message, interval, unit });
    }

    saveData(client, list);
}

function removeAutoMsg(client, channelId) {
    const list = loadData(client);
    const newList = list.filter(x => x.channelId !== channelId);
    saveData(client, newList);
    stopTimer(client, channelId);
}

function getList(client) {
    return loadData(client);
}

module.exports = { initialize, startTimer, stopTimer, addAutoMsg, removeAutoMsg, getList };
