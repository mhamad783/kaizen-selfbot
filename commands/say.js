module.exports = {
    name: 'say',
    category: 'Utility',
    description: 'Echo back the text provided',
    usage: 'say <text>',
    async execute(message, args, client) {
        if (!args.length) {
            return message.channel.send('Please provide some text to say.');
        }

        const textToSay = args.join(' ');

        // Try to delete the original message if we have permission
        if (message.author.id === client.user.id) {
            try { await message.delete(); } catch (e) { }
        } else if (message.guild && message.guild.me.permissionsIn(message.channel).has('MANAGE_MESSAGES')) {
            try { await message.delete(); } catch (e) { }
        }

        // Send the plain text
        await message.channel.send(textToSay);
    }
};
