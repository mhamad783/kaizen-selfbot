const fs = require('fs');
const path = require('path');
const statusManager = require('./statusManager');

function getRpcFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'rpc.json');
}

const defaultData = {
    enabled: false,
    type: 'PLAYING',
    name: 'Kaizen+',
    applicationId: '',
    details: '',
    state: '',
    largeImage: '',
    largeText: '',
    smallImage: '',
    smallText: '',
    button1Text: '',
    button2Text: '',
    button2Url: '',
    enableProgressBar: false,
    startTimestamp: 0,
    endTimestamp: 0,
    spoofEnabled: false,
    spoofType: 'none',
    gameSpoofing: false,
    selectedGame: 'none'
};

function loadData(client) {
    const file = getRpcFile(client);
    if (!fs.existsSync(file)) return defaultData;
    try {
        const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...defaultData, ...loaded };
    } catch (e) { return defaultData; }
}

function saveData(client, data) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const dataDir = path.join(__dirname, '..', folder);
    const file = getRpcFile(client);

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const startOffset = parseInt(data.startTimestamp);
    const endOffset = parseInt(data.endTimestamp);

    if (data.gameSpoofing) {
        const oldData = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        if (!oldData.gameSpoofing || oldData.selectedGame !== data.selectedGame || !oldData.epochGameTimestamp) {
            data.epochGameTimestamp = Date.now();

        } else {
            data.epochGameTimestamp = oldData.epochGameTimestamp;
        }
    }

    if (data.enableProgressBar && !isNaN(endOffset) && endOffset > 0) {
        const realStart = Date.now() - (isNaN(startOffset) ? 0 : startOffset);
        data.epochTimestamp = realStart;
        data.epochEndTimestamp = realStart + endOffset;
    } else {
        delete data.epochEndTimestamp;
        if (!isNaN(startOffset) && startOffset > 0) {
            data.epochTimestamp = Date.now() - startOffset;
        } else {
            delete data.epochTimestamp;
        }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function setPresence(client, data) {
    if (!client.user) return;

    try {
        const activities = [];

        if (data.enabled) {
            const rpcActivity = {
                type: data.type.toUpperCase(),
                application_id: data.applicationId || client.user.id,
                name: data.name || 'Kaizen+',
                details: data.details || undefined,
                state: data.state || undefined,
                assets: {},
                buttons: [],
                metadata: { button_urls: [] }
            };

            if (data.type.toUpperCase() === 'STREAMING') {
                rpcActivity.url = 'https://twitch.tv/discord';
            }

            if (data.enableProgressBar && data.epochEndTimestamp > 0) {
                rpcActivity.timestamps = {
                    start: data.epochTimestamp || Date.now(),
                    end: data.epochEndTimestamp
                };
            } else if (data.epochTimestamp && data.epochTimestamp > 0) {
                rpcActivity.timestamps = { start: data.epochTimestamp };
            } else if (data.startTimestamp > 0) {
                rpcActivity.timestamps = { start: Date.now() - parseInt(data.startTimestamp) };
            }

            if (data.largeImage) {
                rpcActivity.assets.large_image = data.largeImage;
                if (data.largeText) rpcActivity.assets.large_text = data.largeText;
            }
            if (data.smallImage) {
                rpcActivity.assets.small_image = data.smallImage;
                if (data.smallText) rpcActivity.assets.small_text = data.smallText;
            }
            if (Object.keys(rpcActivity.assets).length === 0) delete rpcActivity.assets;

            const isValidUrl = (url) => url && (url.startsWith('http://') || url.startsWith('https://'));
            if (data.button1Text && isValidUrl(data.button1Url)) {
                rpcActivity.buttons.push(data.button1Text);
                rpcActivity.metadata.button_urls.push(data.button1Url);
            }
            if (data.button2Text && isValidUrl(data.button2Url)) {
                rpcActivity.buttons.push(data.button2Text);
                rpcActivity.metadata.button_urls.push(data.button2Url);
            }
            if (rpcActivity.buttons.length === 0) {
                delete rpcActivity.buttons;
                delete rpcActivity.metadata;
            }

            // --- SPOOFING LOGIC ---
            if (data.gameSpoofing) {
                delete rpcActivity.details;
                delete rpcActivity.state;
                rpcActivity.assets = {};
                delete rpcActivity.buttons;
                delete rpcActivity.metadata;

                rpcActivity.type = 'PLAYING';
                rpcActivity.timestamps = { start: data.epochGameTimestamp || Date.now() };

                const spoofGames = {
                    'minecraft': { app_id: '1402418491272986635', name: 'Minecraft', img: 'https://cdn.discordapp.com/app-icons/1402418491272986635/166fbad351ecdd02d11a3b464748f66b.png?size=240&keep_aspect_ratio=false' },
                    'genshin': { app_id: '762434991303950386', name: 'Genshin Impact', img: 'https://cdn.discordapp.com/app-icons/762434991303950386/eb0e25b739e4fa38c1671a3d1edcd1e0.png?size=240&keep_aspect_ratio=false' },
                    'wuthering_waves': { app_id: '1247227126416146462', name: 'Wuthering Waves', img: 'https://cdn.discordapp.com/app-icons/1247227126416146462/c7bb04bdddaa82cf045b02df7168365e.png?size=240&keep_aspect_ratio=false' },
                    'forza_horizon_5': { app_id: '905961880789590076', name: 'Forza Horizon 5', img: 'https://cdn.discordapp.com/app-icons/905961880789590076/229e83c3817d45ecabdaa2f343eadd34.png?size=240&keep_aspect_ratio=false' },
                    'arknights_endfield': { app_id: '1461154307171811401', name: 'Arknights:Endfield', img: 'https://cdn.discordapp.com/app-icons/1461154307171811401/a1c43f46f274856e6fb9edc8afda149d.png?size=240&keep_aspect_ratio=false' },
                    'valorant': { app_id: '700136079562375258', name: 'Valorant', img: 'https://cdn.discordapp.com/app-icons/700136079562375258/e55fc8259df1548328f977d302779ab7.png?size=240&keep_aspect_ratio=false' },
                    'gta5': { app_id: '1402418714716143646', name: 'GTA5', img: 'https://cdn.discordapp.com/app-icons/1402418714716143646/b77111108195cd5e4dd2011dd39bf67d.png?size=240&keep_aspect_ratio=false' },
                    'vrchat': { app_id: '398632010442211348', name: 'VRChat', img: 'https://cdn.discordapp.com/app-icons/398632010442211348/5881acfa9405ee69158591ec1a791c74.png?size=240&keep_aspect_ratio=false' },
                    'cs2': { app_id: '1158877933042143272', name: 'Counter-Strike 2', img: 'https://cdn.discordapp.com/app-icons/1158877933042143272/558f5a26ecb3b17c3dea3d15c1df537a.png?size=80&keep_aspect_ratio=false' }
                };

                if (data.selectedGame && spoofGames[data.selectedGame]) {
                    const gameInfo = spoofGames[data.selectedGame];
                    rpcActivity.application_id = gameInfo.app_id;
                    rpcActivity.name = gameInfo.name;
                    rpcActivity.assets.large_image = gameInfo.img;
                }
            } else if (data.spoofEnabled) {
                if (data.spoofType === 'crunchyroll') {
                    rpcActivity.application_id = '981509069309354054';
                } else if (data.spoofType === 'playstation') {
                    rpcActivity.application_id = '1008890872156405890';
                    rpcActivity.platform = 'ps5'; // Specifically inject the platform for PS5
                }
            }

            activities.push(rpcActivity);
        }

        // 2. Custom Status Activity
        const statusData = statusManager.loadData(client);
        const statusActivity = statusManager.getStatusActivity(statusData);
        if (statusActivity) {
            activities.push(statusActivity);
        }

        // 3. Set Presence
        await client.user.setPresence({
            status: statusData.status || 'online',
            activities: activities
        });

    } catch (e) {
        console.error("[RPC] Error setting presence:", e);
    }
}

module.exports = {
    loadData,
    saveData,
    setPresence,
    initialize: async (client) => {
        const data = loadData(client);
        await setPresence(client, data);
    }
};