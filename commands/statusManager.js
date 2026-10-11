const fs = require('fs');
const path = require('path');

function getStatusFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'status.json');
}

const defaultData = {
    status: 'online',
    custom_status: '',
    emoji: ''
};

function loadData(client) {
    const file = getStatusFile(client);
    if (!fs.existsSync(file)) return defaultData;
    try {
        const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...defaultData, ...loaded };
    } catch (e) { return defaultData; }
}

function saveData(client, data) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const dataDir = path.join(__dirname, '..', folder);
    const file = getStatusFile(client);

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    // Merge with existing to avoid overwriting missing keys if any
    const existing = loadData(client);
    const newData = { ...existing, ...data };
    fs.writeFileSync(file, JSON.stringify(newData, null, 2));
}

function parseEmoji(text) {
    if (!text) return null;
    const customEmojiRegex = /<(a)?:(\w+):(\d+)>/;
    const match = text.match(customEmojiRegex);
    if (match) {
        return {
            name: match[2],
            id: match[3],
            animated: !!match[1]
        };
    }
    return {
        name: text,
        id: null,
        animated: false
    };
}

function getStatusActivity(data) {
    if (!data.custom_status && !data.emoji) return null;

    const activity = {
        type: 'CUSTOM',
        name: 'Custom Status',
        state: data.custom_status || ' ', // FIX: Use space if empty to prevent "Custom Status" text
    };

    if (data.emoji) {
        activity.emoji = parseEmoji(data.emoji);
    }

    return activity;
}

module.exports = {
    loadData,
    saveData,
    getStatusActivity
};
