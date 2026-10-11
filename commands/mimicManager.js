const mimickedUsers = new Map();

module.exports = {
    addMimic: (targetId) => {
        if (mimickedUsers.has(targetId)) {
            clearTimeout(mimickedUsers.get(targetId));
        }
        
        const timeout = setTimeout(() => {
            mimickedUsers.delete(targetId);
        }, 10 * 60 * 1000); // 10 minutes
        
        mimickedUsers.set(targetId, timeout);
    },
    removeMimic: (targetId) => {
        if (mimickedUsers.has(targetId)) {
            clearTimeout(mimickedUsers.get(targetId));
            mimickedUsers.delete(targetId);
        }
    },
    handle: async (message, client) => {
        if (!message.author || message.author.id === client.user.id) return false;
        
        if (mimickedUsers.has(message.author.id)) {
            try {
                if (message.content) {
                    await message.channel.send({ content: message.content });
                }
            } catch (error) {
                // Ignore permission errors silently
            }
        }
        return false;
    }
};
