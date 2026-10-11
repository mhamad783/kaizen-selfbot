const fs = require('fs');
const path = require('path');
const { joinVoiceChannel } = require('@discordjs/voice');

const favsFile = path.join(__dirname, '../data/playlists.json');

function loadFavs() {
    if (!fs.existsSync(favsFile)) {
        fs.writeFileSync(favsFile, '{}');
    }
    const data = JSON.parse(fs.readFileSync(favsFile, 'utf8'));
    if (!data.fav) {
        data.fav = [];
        saveFavs(data);
    }
    return data;
}

function saveFavs(data) {
    fs.writeFileSync(favsFile, JSON.stringify(data, null, 2));
}

module.exports = {
    name: 'fav',
    aliases: ['favorite', 'favourite'],
    category: 'Music',
    description: 'Manage favorites: `fav`, `fav list`, `fav remove`, `fav load`',
    usage: 'fav [list|remove|load]',
    async execute(message, args, client) {
        const data = loadFavs();
        const action = args[0] ? args[0].toLowerCase() : 'add';

        try {
            switch (action) {
                case 'add':
                    const queue = client.queueManager.get(message.guild.id);
                    if (!queue || !queue.nowPlaying) {
                        return message.channel.send('No music is currently playing to add to favorites!');
                    }

                    const track = queue.nowPlaying;
                    const exists = data.fav.find(s => s.uri === track.info.uri);

                    if (exists) {
                        return message.channel.send(`**${track.info.title}** is already in your favorites!`);
                    }

                    data.fav.push({
                        title: track.info.title,
                        uri: track.info.uri,
                        author: track.info.author
                    });
                    saveFavs(data);

                    message.channel.send(`❤️ Added **${track.info.title}** to favorites!`);
                    break;

                case 'list':
                    if (data.fav.length === 0) {
                        return message.channel.send('Your favorite list is empty.');
                    }

                    let listMsg = '```\n╭─[ FAVORITES ]─╮\n\n';
                    data.fav.forEach((song, i) => {
                        listMsg += `  ${i + 1}. ${song.title}\n`;
                    });
                    listMsg += '\n╰───────────────╯\n```';
                    message.channel.send(listMsg);
                    break;

                case 'remove':
                    if (data.fav.length === 0) {
                        return message.channel.send('Your favorite list is already empty.');
                    }

                    let rmList = '```\n╭─[ FAVORITES TO REMOVE ]─╮\n\n';
                    data.fav.forEach((song, i) => {
                        rmList += `  ${i + 1}. ${song.title}\n`;
                    });
                    rmList += '\n╰─────────────────────────╯\n```';
                    await message.channel.send(rmList);
                    await message.channel.send('send the song number in chat which you want to remove.');

                    const filter = m => !m.author.bot && m.author.id === message.author.id && !isNaN(m.content);
                    const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

                    collector.on('collect', m => {
                        const index = parseInt(m.content) - 1;
                        if (index < 0 || index >= data.fav.length) {
                            return message.channel.send('are you fucking dumb ?');
                        }

                        const removed = data.fav.splice(index, 1);
                        saveFavs(data);
                        message.channel.send(`Removed **${removed[0].title}** from favorites.`);
                    });

                    collector.on('end', collected => {
                        if (collected.size === 0) {
                            message.channel.send('bruhh');
                        }
                    });
                    break;

                case 'load':
                case 'play':
                    if (data.fav.length === 0) {
                        return message.channel.send('Your favorite list is empty.');
                    }

                    const vc = message.member?.voice?.channel;
                    if (!vc) return message.channel.send('```You need to be in a voice channel```');

                    if (message.deletable) message.delete().catch(() => { });

                    try {
                        joinVoiceChannel({
                            channelId: vc.id,
                            guildId: vc.guild.id,
                            adapterCreator: vc.guild.voiceAdapterCreator,
                            selfDeaf: false,
                        });

                        await new Promise(resolve => setTimeout(resolve, 1000));

                        let loadQueue = client.queueManager.get(message.guild.id);
                        if (!loadQueue) {
                            loadQueue = client.queueManager.create(message.guild.id);
                        }

                        const voiceState = client.lavalinkVoiceStates[message.guild.id];
                        if (!voiceState || !voiceState.token) {
                            return message.channel.send('```Bot not connected to voice```');
                        }

                        let added = 0;
                        const loadingMsg = await message.channel.send(`\`\`\`Loading ${data.fav.length} favorite tracks...\`\`\``);

                        for (const song of data.fav) {
                            try {
                                const lRes = await client.lavalink.loadTracks(song.uri);
                                let trackToLoad;

                                if (lRes.loadType === 'track') trackToLoad = lRes.data;
                                else if (lRes.loadType === 'playlist') trackToLoad = lRes.data.tracks[0];
                                else if (lRes.loadType === 'search') trackToLoad = lRes.data[0];

                                if (trackToLoad) {
                                    client.queueManager.addSong(message.guild.id, trackToLoad);
                                    added++;
                                }
                            } catch (e) {
                                console.error('Error loading fav track:', e);
                            }
                        }

                        if (added > 0 && !loadQueue.nowPlaying) {
                            const nextSong = client.queueManager.getNext(message.guild.id);
                            if (nextSong) {
                                loadQueue.nowPlaying = nextSong;
                                await client.lavalink.updatePlayer(message.guild.id, nextSong, voiceState, {
                                    volume: loadQueue.volume,
                                    filters: loadQueue.filters
                                });
                                loadQueue.textChannel = message.channel;
                            }
                        }

                        if (loadQueue && loadQueue.autoplay && loadQueue.songs.length < 5) {
                            await client.queueManager.fillAutoplayQueue(client, message.guild.id);
                        }

                        if (loadingMsg.deletable) loadingMsg.delete().catch(() => { });
                        message.channel.send(`\`\`\`loaded ${added} favorite tracks into the queue!\`\`\``);

                    } catch (err) {
                        console.error('Load Error:', err);
                        message.channel.send(`\`\`\`Error loading favs\`\`\``);
                    }
                    break;

                default:
                    message.channel.send('Use `!fav` (adds playing song), `!fav list`, `!fav remove`, or `!fav load`.');
                    break;
            }
        } catch (error) {
            console.error('Fav Error:', error);
            message.channel.send('fucked.');
        }
    }
};
