module.exports = {
    name: 'skip',
    description: 'Skip to the next song',
    async execute(message, args, client) {
        if (!message.guild) {
            await message.channel.send('```This command only works in servers```');
            return;
        }

        const queue = client.queueManager.get(message.guild.id);

        if (!queue || !queue.nowPlaying) {
            await message.channel.send('```No music is playing```');
            return;
        }

        try {
            const skippedSong = queue.nowPlaying;

            if (queue.autoplay && queue.songs.length < 5) {
                await client.queueManager.fillAutoplayQueue(client, message.guild.id);
            }

            const nextSong = client.queueManager.getNext(message.guild.id);

            if (!nextSong) {
                await client.lavalink.destroyPlayer(message.guild.id);
                client.queueManager.delete(message.guild.id);

                let response = '```\n';
                response += '╭─[ SKIPPED ]─╮\n\n';
                response += `  ⏭️ Skipped: ${skippedSong.info.title}\n`;
                response += '  📭 No more songs in queue\n';
                response += '\n╰──────────────────────────────────╯\n```';

                await message.channel.send(response);
                return;
            }

            queue.nowPlaying = nextSong;
            const voiceState = client.lavalinkVoiceStates[message.guild.id];

            await client.lavalink.updatePlayer(
                message.guild.id,
                nextSong,
                voiceState,
                { volume: queue.volume, filters: queue.filters }
            );

            let response = '```\n';
            response += '╭─[ SKIPPED ]─╮\n\n';
            response += `  ⏭️ Skipped: ${skippedSong.info.title}\n\n`;
            response += '  🎵 Now Playing:\n';
            response += `     ${nextSong.info.title}\n`;
            response += `     by ${nextSong.info.author}\n`;
            response += '\n╰──────────────────────────────────╯\n```';

            await message.channel.send(response);

            if (message.deletable) {
                await message.delete().catch(() => { });
            }
        } catch (err) {
            console.error('[Skip Error]:', err);
            await message.channel.send(`\`\`\`js\n❌ Error: ${err.message}\n\`\`\``);
        }
    },
};
