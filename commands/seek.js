module.exports = {
    name: 'seek',
    description: '`120`, `1:20`, `+10`, `-10`',
    async execute(message, args, client) {
        if (!client.queueManager) return;
        const guildId = message.guild.id;
        const queue = client.queueManager.get(guildId);

        if (!queue || !queue.nowPlaying) {
            return message.reply('No music is currently playing');
        }

        if (!args[0]) {
            return message.reply('specify the time to seek to (e.g. `120`, `1:20`, `+10`, `-10`)');
        }

        let newPosition = queue.position;
        const input = args[0];

        if (input.startsWith('+')) {
            const amount = parseInt(input.slice(1));
            if (isNaN(amount)) return message.reply('dumb ??');
            newPosition += amount * 1000;
        } else if (input.startsWith('-')) {
            const amount = parseInt(input.slice(1));
            if (isNaN(amount)) return message.reply('dumb ??');
            newPosition -= amount * 1000;
        } else {
            // Check if it's MM:SS format
            if (input.includes(':')) {
                const parts = input.split(':');
                const minutes = parseInt(parts[0]);
                const seconds = parseInt(parts[1]);
                if (isNaN(minutes) || isNaN(seconds)) return message.reply('dumb ??');
                newPosition = (minutes * 60 + seconds) * 1000;
            } else {
                const amount = parseInt(input);
                if (isNaN(amount)) return message.reply('dumb ??');
                newPosition = amount * 1000;
            }
        }

        if (newPosition < 0) newPosition = 0;
        if (newPosition > queue.nowPlaying.info.length) {
            newPosition = queue.nowPlaying.info.length - 1000;
            if (newPosition < 0) newPosition = 0;
        }

        try {
            await client.lavalink.updatePlayerProperties(guildId, { position: newPosition });
            queue.position = newPosition;
            queue.lastUpdate = Date.now();
            message.reply(`Seeked to \`${formatTime(newPosition)}\`.`);
        } catch (error) {
            console.error('Error seeking:', error);
            message.reply('An error occurred while seeking.');
        }

        function formatTime(ms) {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
};
