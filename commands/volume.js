module.exports = {
    name: 'volume',
    aliases: ['vol', 'v'],
    category: 'Music',
    description: 'Set volume (0-500)',
    usage: 'volume <0-500>',
    async execute(message, args, client) {
        if (!message.guild) return;

        const queue = client.queueManager.get(message.guild.id);
        if (!queue) {
            return message.channel.send('bro no music playing!');
        }

        if (!args[0]) {
            return message.channel.send(`Current Volume: **${queue.volume || 100}%**`);
        }

        const vol = parseInt(args[0]);
        if (isNaN(vol) || vol < 0 || vol > 500) {
            return message.channel.send('provide a volume between 0-500.');
        }

        queue.volume = vol;

        try {
            await client.lavalink.updatePlayerProperties(message.guild.id, {
                volume: vol
            });

            const filled = Math.min(20, Math.floor(vol / 10));
            const empty = Math.max(0, 20 - filled);
            const volumeBar = '█'.repeat(filled) + '░'.repeat(empty);

            let response = '```js\n';
            response += ` Volume: ${vol}%\n`;
            response += ` [${volumeBar}]\n`;
            response += '╰──────────────────────────────────╯\n```';

            await message.channel.send(response);

        } catch (err) {
            console.error('[Volume Error]:', err);
            await message.channel.send('Failed to set volume.');
        }
    }
};
