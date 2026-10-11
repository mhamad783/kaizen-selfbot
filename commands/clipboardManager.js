const fs = require('fs');
const path = require('path');

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'clipboard.json');
}

function loadData(client) {
    const file = getFile(client);
    if (!fs.existsSync(file)) {
        return { triggers: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return { triggers: {} };
    }
}

function saveData(client, data) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const dataDir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(getFile(client), JSON.stringify(data, null, 2));
}

function addTrigger(client, trigger, response) {
    const data = loadData(client);
    data.triggers[trigger] = response;
    saveData(client, data);
}

function removeTrigger(client, trigger) {
    const data = loadData(client);
    if (data.triggers[trigger]) {
        delete data.triggers[trigger];
        saveData(client, data);
    }
}

function getResponse(client, trigger) {
    const data = loadData(client);
    return data.triggers[trigger] || null;
}

module.exports = {
    loadData,
    saveData,
    addTrigger,
    removeTrigger,
    getResponse
};
