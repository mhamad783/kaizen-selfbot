module.exports = {
    name: 'dm',
    category: 'Utility',
    description: 'DM a user',
    async execute(message, args, client) {
        // Usage: !dm <id> <message...>
        if (args.length < 2) return;

        const userId = args[0];
        const content = args.slice(1).join(' ');

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return; // Silent fail

            await user.send(content);

            // Send "ok" without ping/reply
            const ok = await message.channel.send("ok");
            setTimeout(() => {
                ok.delete().catch(() => { });
            }, 3000);

        } catch (e) {
            // Silent fail
        }
    }
};
