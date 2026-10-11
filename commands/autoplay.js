module.exports = {
    name: 'autoplay',
    category: 'Music',
    description: 'Toggle Autoplay on/off',
    async execute(message, args, client) {
        if (!client.queueManager) return;
        const guildId = message.guild.id;
        const queue = client.queueManager.get(guildId);

        if (!queue) {
            return message.reply('bruh no music is currently playing.');
        }

        queue.autoplay = !queue.autoplay;

        if (queue.autoplay) {
            await client.queueManager.fillAutoplayQueue(client, guildId);
            message.reply('Autoplay is now **ENABLED**.');
        } else {
            message.reply('Autoplay is now **DISABLED**.');
        }
    }
};
