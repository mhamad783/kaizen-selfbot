const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

const clientSetups = new Map();

function getFile(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return path.join(__dirname, '..', folder, 'qr.json');
}

function getActiveSetupMap(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    if (!clientSetups.has(folder)) {
        clientSetups.set(folder, new Map());
    }
    return clientSetups.get(folder);
}

function loadData(client) {
    const file = getFile(client);
    if (!fs.existsSync(file)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { return {}; }
}

function saveData(client, data) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    const dataDir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(getFile(client), JSON.stringify(data, null, 2));
}

module.exports = {
    async handle(message, client, isAllowed) {
        if (!isAllowed) return false;

        const content = message.content.trim();
        const lower = content.toLowerCase();
        const userId = message.author.id;
        const now = Date.now();
        const activeSetup = getActiveSetupMap(client);

        if (activeSetup.has(userId)) {
            const sess = activeSetup.get(userId);
            if (now - sess.startTime > 300000) {
                activeSetup.delete(userId);
                message.reply('Setup timed out.');
                return true; // handled
            }
        }

        if (lower === 'qr' || lower === 'change qr') {
            const db = loadData(client);
            if (lower === 'qr' && db[userId] && db[userId].img) {
                await message.channel.send(db[userId].img);
                // Send ID if exists
                if (db[userId].id) {
                    await message.channel.send(db[userId].id);
                }
                return true;
            }

            // Start Setup
            activeSetup.set(userId, { step: 1, startTime: now });
            await message.channel.send('send your qr link or image');
            return true;
        }

    
        const activeSetup2 = getActiveSetupMap(client);
        const session = activeSetup2.get(userId);
        if (session) {
            if (session.step === 1) {
                let imgUrl = null;

                if (message.attachments.size > 0) {
                    imgUrl = message.attachments.first().url;
                } else if (content.startsWith('http')) {
                    imgUrl = content; 
                }

                if (imgUrl) {
                    session.pendingImg = imgUrl; 
                    session.step = 2;
                    activeSetup2.set(userId, session);
                    await message.channel.send("ok"); // Acknowledgement
                    await message.channel.send("send your id if u don't weant to set then say no");
                    return true;
                }

                return false;
            }

            // STEP 2: Handle ID
            if (session.step === 2) {
                const db = loadData(client);
                const input = content;

                db[userId] = {
                    img: session.pendingImg,
                    id: (input.toLowerCase() === 'no') ? null : input
                };

                saveData(client, db);
                activeSetup2.delete(userId);

                if (db[userId].id) await message.channel.send('done');
                else await message.channel.send('ok'); 


                return true;
            }
        }

        return false;
    }
};
