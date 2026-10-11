const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

let clientJobs = new Map();

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'timed_msg.json');
}

function getActiveJobsMap(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    if (!clientJobs.has(folder)) {
        clientJobs.set(folder, new Map());
    }
    return clientJobs.get(folder);
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

async function executeMessage(client, item) {
    const jobId = item.id;
    try {
        console.log(`[Timed Msg] Executing ${jobId} for ${item.channelId}...`);

        let target;
        try {
            const channel = await client.channels.fetch(item.channelId).catch(() => null);
            if (channel && channel.isText()) target = channel;
            else {
                const user = await client.users.fetch(item.channelId).catch(() => null);
                if (user) target = user;
            }
        } catch (e) { }

        if (target) {
            await target.send(item.message);
            console.log(`[Timed Msg] SUCCESS: Sent to ${item.channelId}`);
        } else {
            console.warn(`[Timed Msg] FAILED: Target ${item.channelId} not found.`);
        }

        removeTimedMsg(client, jobId);

    } catch (e) {
        console.error(`[Timed Msg] Error executing ${jobId}:`, e.message);
    }
}

async function initialize(client) {
    console.log("[Timed Msg] Initializing for", client.user?.tag || "Unknown");
    const saved = loadData(client);
    const now = Date.now();
    let count = 0;


    for (const item of saved) {
        const targetTime = new Date(item.timestamp).getTime();

        if (targetTime <= now) {

            console.log(`[Timed Msg] Found missed message ${item.id}. Sending immediately...`);
            executeMessage(client, item);
        } else {

            scheduleMessage(client, item);
            count++;
        }
    }

    console.log(`[Timed Msg] Scheduled ${count} future messages.`);
}

function scheduleMessage(client, item) {
    const activeJobs = getActiveJobsMap(client);
    const jobId = item.id;
    if (activeJobs.has(jobId)) {
        activeJobs.get(jobId).stop();
        activeJobs.delete(jobId);
    }

    const date = new Date(item.timestamp);

    const seconds = date.getSeconds();
    const minutes = date.getMinutes();
    const hours = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const cronPattern = `${seconds} ${minutes} ${hours} ${day} ${month} *`;

    try {
        const task = cron.schedule(cronPattern, () => executeMessage(client, item));
        const activeJobs = getActiveJobsMap(client);
        activeJobs.set(jobId, task);
    } catch (e) {
        console.error(`[Timed Msg] Failed to schedule ${jobId}:`, e.message);
    }
}

function addTimedMsg(client, channelId, message, timestamp, timezone) {
    const list = loadData(client);
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

    const newItem = {
        id,
        channelId,
        message,
        timestamp, // ISO string
        timezone
    };

    list.push(newItem);
    saveData(client, list);

    // Schedule
    scheduleMessage(client, newItem);
    return newItem;
}

function removeTimedMsg(client, id) {
    const list = loadData(client);
    const newList = list.filter(x => x.id !== id);
    saveData(client, newList);

    const activeJobs = getActiveJobsMap(client);
    if (activeJobs.has(id)) {
        activeJobs.get(id).stop();
        activeJobs.delete(id);
    }
}

function getList(client) {
    return loadData(client);
}

module.exports = { initialize, addTimedMsg, removeTimedMsg, getList };
