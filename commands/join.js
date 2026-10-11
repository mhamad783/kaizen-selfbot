module.exports = {
    name: 'join',
    category: 'Music',
    description: 'Join a voice channel',
    async execute(message, args, client) {
        const guildId = message.guild.id;
        let channelId = args[0];

        // If no ID provided, try to get user's voice channel
        if (!channelId) {
            const member = message.guild.members.cache.get(message.author.id);
            if (member && member.voice && member.voice.channelId) {
                channelId = member.voice.channelId;
            }
        }

        if (!channelId) {
            return message.reply('Please provide a channel ID or join a voice channel first!');
        }

        try {
            // Join Voice Channel
            if (client.ws && client.ws.shards) {
                client.ws.shards.get(message.guild.shardId).send({
                    op: 4,
                    d: {
                        guild_id: guildId,
                        channel_id: channelId,
                        self_mute: false,
                        self_deaf: false
                    }
                });
            } else {
                client.ws.broadcast({
                    op: 4,
                    d: {
                        guild_id: guildId,
                        channel_id: channelId,
                        self_mute: false,
                        self_deaf: false
                    }
                });
            }
            message.reply(`Connected to <#${channelId}>`);
        } catch (error) {
            console.error(error);
            message.reply('Failed to join voice channel.');
        }
    }
};
