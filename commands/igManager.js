const { Message } = require('discord.js-selfbot-v13');

function extractReelId(link) {
    try {
        const patterns = [
            /instagram\.com\/reels?\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/p\/([A-Za-z0-9_-]+)/
        ];

        for (const pattern of patterns) {
            const match = link.match(pattern);
            if (match && match[1]) {

                return match[1].split('?')[0].split('/')[0];
            }
        }
        return null;
    } catch (error) {
        console.error('[IG Manager] Extract Error:', error);
        return null;
    }
}

/**

 * @param {Message} message 
 */
async function handle(message) {
    const prefix = process.env.PREFIX || '!';
    if (message.content.startsWith(prefix)) return false;

    if (!message.content.includes('instagram.com')) return false;


    if (message.content.includes('kkinstagram.com') || message.content.includes('ddinstagram.com')) return false;


    const reelId = extractReelId(message.content);

    if (reelId) {

        const newLink = `[+](https://kkinstagram.com/reels/${reelId})`;

        try {
            await message.channel.send(newLink);
            return true;
        } catch (e) {

        }
    }

    return false;
}

module.exports = { handle };
