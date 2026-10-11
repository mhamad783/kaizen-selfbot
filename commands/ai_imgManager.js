const { MessageAttachment } = require('discord.js-selfbot-v13');
const fetch = require('node-fetch');

module.exports = {
    name: 'img',
    description: 'Generate an AI image based on prompt using Nvidia Stable Diffusion 3 Medium',
    async execute(message, args, client) {
        if (!args.length) {
            return message.reply({ content: 'Please provide a prompt! Example: `!img a futuristic city at sunset`' });
        }

        const prompt = args.join(' ');
        const apiKey = process.env.AI_API;

        if (!apiKey) {
            return message.reply({ content: 'AI_API key is missing in the .env file.' });
        }

        let waitMsg;
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitMsg = await message.channel.send('ok ok');
        } catch (e) {
            console.error('Failed to send wait message:', e);
        }

        try {
            const invokeUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";
            
            // Following the Nvidia API payload format
            const payload = {
                "prompt": prompt,
                "cfg_scale": 5,
                "aspect_ratio": "16:9",
                "seed": 0, // Using 0 for random seed behavior conventionally
                "steps": 40,
                "negative_prompt": "blurry, low quality, distorted, bad anatomy"
            };

            const response = await fetch(invokeUrl, {
                method: "post",
                body: JSON.stringify(payload),
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            });

            if (response.status !== 200) {
                const errBody = await response.text();
                throw new Error(`API returned status ${response.status}: ${errBody}`);
            }

            const responseBody = await response.json();
            
            if (!responseBody.image) {
                throw new Error('No image returned from the API.');
            }

            // Nvidia API returns base64 image field
            const buffer = Buffer.from(responseBody.image, 'base64');
            const attachment = new MessageAttachment(buffer, 'generated.png'); // usually png format

            await message.channel.send({ 
                files: [attachment]
            });

            // Delete the temporary wait message
            if (waitMsg) {
                try {
                    await waitMsg.delete();
                } catch (e) {}
            }

        } catch (error) {
            console.error('AI Image Generation Error:', error);
            if (waitMsg) {
                try { 
                    await waitMsg.edit({ content: `❌ Failed to generate image: ${error.message}` });
                } catch (e) {
                    await message.channel.send({ content: `❌ Failed to generate image.` });
                }
            }
        }
    }
};
