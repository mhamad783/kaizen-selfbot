const fs = require('fs');
const path = require('path');

const clientConfigs = {};

const defaultConfig = {
    global: true,
    enabledServers: [],
    enabledChannels: [],
    textTriggers: {},
    userTriggers: {}
};

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'autoreactions.json');
}

function loadData(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const file = getFile(client);
    if (!fs.existsSync(file)) return { ...defaultConfig };
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const config = {
            global: data.global ?? true,
            enabledServers: data.enabledServers || [],
            enabledChannels: data.enabledChannels || [],
            textTriggers: data.textTriggers || {},
            userTriggers: data.userTriggers || {}
        };
        clientConfigs[folder] = config;
        return config;
    } catch (e) { return { ...defaultConfig }; }
}

function saveData(client, newConfig) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    if (newConfig) clientConfigs[folder] = newConfig;
    const dataDir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(getFile(client), JSON.stringify(clientConfigs[folder] || newConfig, null, 2));
}

function isReactionEnabled(client, channelId, guildId) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const config = clientConfigs[folder] || loadData(client);
    if (config.enabledChannels.includes(channelId)) return true;
    if (guildId && config.enabledServers.includes(guildId)) return true;
    return config.global;
}

module.exports = {
    loadData,
    saveData,

    initialize: (client) => {
        console.log('[AutoReaction] Initializing for', client.user?.tag || 'Unknown');
        loadData(client);

        client.on('messageCreate', async (message) => {
            if ((message.author.bot && message.author.id !== client.user.id) || !message.guild) return; // Ignore other bots/DMs usually
            // Prevent ignoring self to allow selfbot to react to own messages

            if (!isReactionEnabled(client, message.channel.id, message.guild.id)) return;

            const folder = client && client.dataFolder ? client.dataFolder : 'data';
            const config = clientConfigs[folder] || loadData(client);

            try {
                // User Triggers
                if (config.userTriggers[message.author.id]) {
                    const emojis = config.userTriggers[message.author.id];
                    for (const emoji of emojis) {
                        try { await message.react(emoji); } catch (e) { }
                    }
                }

                // Text Triggers
                const content = message.content.toLowerCase();
                for (const trigger in config.textTriggers) {
                    if (content.includes(trigger.toLowerCase())) {
                        const emojis = config.textTriggers[trigger];
                        for (const emoji of emojis) {
                            try { await message.react(emoji); } catch (e) { }
                        }
                    }
                }
            } catch (e) {
                console.error('[AutoReaction] Error:', e);
            }
        });
    }
};
