module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    async execute(message, args, client) {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        sent.edit(`🏓 Pong!\nLatency: ${latency}ms\nAPI Latency: ${apiLatency}ms`);
    }
};
