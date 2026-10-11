const { createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior } = require('@discordjs/voice');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');

try {
    const ffmpegPath = require('ffmpeg-static');
    process.env.FFMPEG_PATH = ffmpegPath;
} catch (e) {
    console.warn('ffmpeg-static not found');
}


const audioPlayers = new Map();

function getAudioPlayer(guildId) {
    if (!audioPlayers.has(guildId)) {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });
        audioPlayers.set(guildId, player);

        player.on('error', error => {
            console.error('[TTS Player] Error:', error.message);
        });
    }
    return audioPlayers.get(guildId);
}

async function speak(message, client) {
    if (!message.content) return;

    const tempFileName = `tts_${message.guild.id}_${Date.now()}.mp3`;
    const tempPath = path.join(__dirname, '..', 'data', 'temp', tempFileName);

    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        const text = message.content;
        const gtts = new gTTS(text, 'en');

        gtts.save(tempPath, async (err, result) => {
            if (err) {
                console.error('[TTS] Save Error:', err);
                return;
            }

            try {
                const connection = getVoiceConnection(message.guild.id);
                if (!connection) {
                    if (client.ttsMap) client.ttsMap.delete(message.guild.id);
                    return;
                }

                const player = getAudioPlayer(message.guild.id);
                connection.subscribe(player);

                const resource = createAudioResource(tempPath, {
                    inlineVolume: true
                });
                resource.volume.setVolume(1);

                player.play(resource);

                const cleanup = () => {
                    try {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    } catch (e) { }
                };

                player.once(AudioPlayerStatus.Idle, cleanup);
                player.once('error', cleanup);

            } catch (playError) {
                console.error('[TTS] Play Error:', playError);
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { }
            }
        });

    } catch (error) {
        console.error('[TTS] Execution Error:', error);
    }
}

module.exports = {
    name: 'tts',
    description: 'Toggle TTS mode. Usage: !tts on/off',
    category: 'Music',
    async execute(message, args, client) {
        if (!message.guild) return message.reply('Server only');

        const mode = args[0] ? args[0].toLowerCase() : null;

        if (mode === 'on') {
            // Check if BOT is in a voice channel
            const botMember = message.guild.me || await message.guild.members.fetch(client.user.id).catch(() => null);
            const targetVC = botMember?.voice?.channel;

            if (!targetVC) {
                return message.reply('hmm use `!join <channel_id>` first.')
                    .then(m => setTimeout(() => m.delete().catch(() => { }), 5000));
            }

            const oldConnection = getVoiceConnection(message.guild.id);
            if (oldConnection) {
                oldConnection.destroy();
                if (client.lavalink) {
                    try { await client.lavalink.destroyPlayer(message.guild.id); } catch (e) { }
                }
                client.queueManager.delete(message.guild.id);

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            try {
                joinVoiceChannel({
                    channelId: targetVC.id,
                    guildId: targetVC.guild.id,
                    adapterCreator: targetVC.guild.voiceAdapterCreator,
                    selfDeaf: false,
                });

                if (!client.ttsMap) client.ttsMap = new Map();
                client.ttsMap.set(message.guild.id, message.channel.id);

                const reply = await message.reply(`ok\nI have rejoined ${targetVC.name}. I will now speak incoming messages.`);
                setTimeout(() => reply.delete().catch(() => { }), 10000);

            } catch (error) {
                console.error(error);
                message.reply('Failed to join voice channel');
            }

        } else if (mode === 'off') {
            if (client.ttsMap) client.ttsMap.delete(message.guild.id);
            const reply = await message.reply('ok');
            setTimeout(() => reply.delete().catch(() => { }), 5000);

        } else {
            message.reply('try `!tts on` or `!tts off`');
        }
    },
    speak
};
