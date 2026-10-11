const { Client } = require('@discordjs/core');
const { REST, DefaultRestOptions } = require('@discordjs/rest');
const { WebSocketManager, WebSocketShard } = require('@discordjs/ws');
const { USER_AGENT, Properties } = require('./constants');
const { QuestManager } = require('./questManager'); // Circular dependency? Be careful.
// Actually QuestManager depends on ClientQuest.
// I'll require QuestManager inside fetchQuests to avoid circular issues or pass 'this'

async function makeRequest(url, init) {
    if (init.headers) {
        const myHeaders = new Headers(init.headers);
        if (myHeaders.has('User-Agent')) {
            myHeaders.set('User-Agent', USER_AGENT);
        }
        if (myHeaders.has('Authorization')) {
            const token = myHeaders.get('Authorization').replace('Bot ', '');
            myHeaders.set('Authorization', token);
        }

        myHeaders.append('accept-language', 'en-US');
        myHeaders.append('origin', 'https://discord.com');
        myHeaders.append('pragma', 'no-cache');
        myHeaders.append('priority', 'u=1, i');
        myHeaders.append('referer', 'https://discord.com/channels/@me');
        myHeaders.append('sec-ch-ua', '"Not)A;Brand";v="8", "Chromium";v="138"');
        myHeaders.append('sec-ch-ua-mobile', '?0');
        myHeaders.append('sec-ch-ua-platform', '"Windows"');
        myHeaders.append('sec-fetch-dest', 'empty');
        myHeaders.append('sec-fetch-mode', 'cors');
        myHeaders.append('sec-fetch-site', 'same-origin');
        myHeaders.append('x-debug-options', 'bugReporterEnabled');
        myHeaders.append('x-discord-locale', 'en-US');
        myHeaders.append('x-discord-timezone', 'Asia/Kolkata');
        myHeaders.append('x-super-properties', Buffer.from(JSON.stringify(Properties)).toString('base64'));

        init.headers = myHeaders;
    }
    return DefaultRestOptions.makeRequest(url, init);
}

// Gateway Spoofing (Prototype Patching)
const originalSend = WebSocketShard.prototype.send;
WebSocketShard.prototype.send = async function (payload) {
    if (payload.op === 2) { // GatewayOpcodes.Identify
        payload.d = {
            token: payload.d.token,
            properties: {
                ...Properties,
                is_fast_connect: false,
                gateway_connect_reasons: 'AppSkeleton',
            },
            capabilities: 0,
            presence: payload.d.presence,
            compress: payload.d.compress,
            client_state: { guild_versions: {} },
        };
    }
    return originalSend.call(this, payload);
};

class ClientQuest extends Client {
    constructor(token) {
        const rest = new REST({ version: '10', makeRequest }).setToken(token);
        const gateway = new WebSocketManager({
            token: token,
            intents: 0,
            rest,
        });

        // Mock Gateway Info
        gateway.fetchGatewayInformation = () => {
            return Promise.resolve({
                url: 'wss://gateway.discord.gg',
                shards: 1,
                session_start_limit: {
                    total: 1000,
                    remaining: 1000,
                    reset_after: 14400000,
                    max_concurrency: 1,
                },
            });
        };

        super({ rest, gateway });
        this.websocketManager = gateway;
        this.questManager = null;
    }

    connect() {
        return this.websocketManager.connect();
    }

    async fetchQuests() {
        // Late require to avoid circular dep issues during init
        const { QuestManager } = require('./questManager');

        const response = await this.rest.get('/quests/@me');
        this.questManager = QuestManager.fromResponse(this, response);
        return this.questManager;
    }
}

module.exports = { ClientQuest };
