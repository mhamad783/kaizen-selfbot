const { fetch } = require('undici');

const ENDPOINT_MAP = {
    'anal': 'hanal',
    'boobs': 'hboobs'
};

module.exports = {
    initialize(client) {
        const commands = [
            { name: 'waifu', type: 'mixed' },
            { name: 'neko', type: 'mixed' },
            { name: 'hug', type: 'sfw' },
            { name: 'kiss', type: 'sfw' },
            { name: 'pat', type: 'sfw' },
            { name: 'slap', type: 'sfw' },
            { name: 'blowjob', type: 'nsfw', source: 'waifu' },
            { name: 'hentai', type: 'nsfw', source: 'neko' },
            { name: 'anal', type: 'nsfw', source: 'neko' },
            { name: 'boobs', type: 'nsfw', source: 'neko' }
        ];

        commands.forEach(cmd => {
            client.commands.set(cmd.name, {
                name: cmd.name,
                category: 'Fun',
                description: `Fun command: ${cmd.name}`,
                execute: async (message, args) => {
                    await this.handleCommand(message, cmd.name, cmd);
                }
            });
        });
    },

    async handleCommand(message, name, config) {
        const isNsfw = message.channel.type === 'GUILD_TEXT' ? message.channel.nsfw : true;
        let url = '';

        try {
            if (config.type === 'nsfw') {
                if (!isNsfw) return;

                if (config.source === 'waifu') {
                    url = await this.getNekoBot('pgif');
                } else {
                    const endpoint = ENDPOINT_MAP[name] || name;
                    url = await this.getNekoBot(endpoint);
                }
            } else if (config.type === 'mixed') {
                if (isNsfw) {
                    if (name === 'waifu') {
                        url = await this.getNekoBot('hentai');
                    } else {
                        url = await this.getNekoBot('neko');
                    }
                } else {
                    url = await this.getNekosLife(name);
                }
            } else {
                url = await this.getNekosLife(name);
            }

            if (!url) return;

            const referenceId = message.reference ? message.reference.messageId : null;

            if (referenceId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(referenceId);
                    if (repliedMsg) {
                        await repliedMsg.reply({ content: url, allowedMentions: { repliedUser: false } });
                    } else {
                        await message.channel.send(url);
                    }
                } catch (e) {
                    await message.channel.send(url);
                }
            } else {
                await message.channel.send(url);
            }

        } catch (e) {
            console.error(`[WaifuManager] Error on ${name}:`, e);
        }
    },

    async getNekosLife(category) {
        try {
            const res = await fetch(`https://nekos.life/api/v2/img/${category}`);
            const data = await res.json();
            return data.url;
        } catch (e) { return null; }
    },

    async getNekoBot(type) {
        try {
            const res = await fetch(`https://nekobot.xyz/api/image?type=${type}`);
            const data = await res.json();
            return data.message;
        } catch (e) { return null; }
    }
};
