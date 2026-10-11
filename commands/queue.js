module.exports = {
    name: 'queue',
    description: 'Show current music queue',
    execute(message, args, client) {
        if (!message.guild) {
            message.channel.send('```This command only works in servers```');
            return;
        }

        const queue = client.queueManager.get(message.guild.id);
        if (!queue || !queue.nowPlaying) {
            message.channel.send('```No music is playing```');
            return;
        }

        let queueText = '```\n';
        queueText += '╭─[ MUSIC QUEUE ]─╮\n\n';

        // Now Playing
        queueText += '🎵 Now Playing:\n';
        queueText += `  ${queue.nowPlaying.info.title}\n`;
        queueText += `  by ${queue.nowPlaying.info.author}\n\n`;

        // Queue
        if (queue.songs.length === 0) {
            queueText += '📭 No songs in queue\n';
        } else {
            queueText += '📝 Up Next:\n';
            queue.songs.slice(0, 10).forEach((song, i) => {
                const index = `[${i + 1}]`.padEnd(5);
                queueText += `  ${index}${song.info.title}\n`;
                queueText += `       by ${song.info.author}\n`;
            });

            if (queue.songs.length > 10) {
                queueText += `\n  ...and ${queue.songs.length - 10} more songs\n`;
            }
        }

        queueText += '\n╰──────────────────────────────────╯\n```';

        message.channel.send(queueText);

        if (message.deletable) {
            message.delete().catch(() => { });
        }
    },
};
