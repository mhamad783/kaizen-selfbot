const { Message } = require('discord.js-selfbot-v13');

function extractVideoId(link) {
    try {
        const patterns = [
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
            /youtube\.com\/shorts\/([^"&?\/\s]{11})/i
        ];

        for (const pattern of patterns) {
            const match = link.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    } catch (error) {
        console.error('[YT Manager] Extract Error:', error);
        return null;
    }
}

/**
 * @param {Message} message 
 */
async function handle(message) {
    const prefix = process.env.PREFIX || '!';
    if (message.content.startsWith(prefix)) return false;

    if (!message.content.includes('youtube.com') && !message.content.includes('youtu.be')) return false;

    if (message.content.includes('koutube.com')) return false;

    const videoId = extractVideoId(message.content);

    if (videoId) {
        const newLink = `[+](https://koutube.com/${videoId})`;

        try {
            await message.channel.send(newLink);
            return true;
        } catch (e) {
            console.error('[YT Manager] Send Error:', e);
        }
    }

    return false;
}

module.exports = { handle };
