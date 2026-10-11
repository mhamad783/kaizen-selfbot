const mimicManager = require('./mimicManager');

module.exports = {
    name: 'mimic',
    description: 'Mimic a user',
    category: 'Fun',
    execute: async (message, args, client) => {
        try {
            if (args.length === 0) {
                return;
            }

            const targetArg = args[0].toLowerCase();

            if (targetArg === 'off') {
                if (args.length < 2) return;
                let targetId = args[1];
                if (targetId.startsWith('<@') && targetId.endsWith('>')) {
                    targetId = targetId.slice(2, -1);
                    if (targetId.startsWith('!')) targetId = targetId.slice(1);
                }

                mimicManager.removeMimic(targetId);
                await message.channel.send('ok');
                return;
            }

            let targetId = args[0];
            if (targetId.startsWith('<@') && targetId.endsWith('>')) {
                targetId = targetId.slice(2, -1);
                if (targetId.startsWith('!')) targetId = targetId.slice(1);
            }

            if (targetId === client.user.id) return;

            mimicManager.addMimic(targetId);
            await message.channel.send('ok');

        } catch (error) {

        }
    }
};
