class Queue {
    constructor() {
        this.queues = new Map();
    }

    get(guildId) {
        return this.queues.get(guildId);
    }

    create(guildId) {
        const queue = {
            songs: [],
            history: [],
            nowPlaying: null,
            volume: 100,
            filters: {},
            loop: 'none',
            autoplay: false,
            textChannel: null,
        };
        this.queues.set(guildId, queue);
        return queue;
    }

    delete(guildId) {
        this.queues.delete(guildId);
    }

    addSong(guildId, song) {
        const queue = this.get(guildId);
        if (queue) {
            queue.songs.push(song);
        }
    }

    getNext(guildId) {
        const queue = this.get(guildId);
        if (queue && queue.songs.length > 0) {
            return queue.songs.shift();
        }
        return null;
    }

    clear(guildId) {
        const queue = this.get(guildId);
        if (queue) {
            queue.songs = [];
        }
    }

    getAll() {
        return this.queues;
    }

    async fillAutoplayQueue(client, guildId) {
        const queue = this.get(guildId);
        if (!queue || !queue.autoplay) return;

        // Try to keep at least 5 songs in the queue
        if (queue.songs.length >= 5) return;

        const lastTrack = queue.songs.length > 0
            ? queue.songs[queue.songs.length - 1]
            : queue.nowPlaying || (queue.history.length > 0 ? queue.history[queue.history.length - 1] : null);

        if (!lastTrack) return;

        try {
            const searchIdentifier = `ytsearch:${lastTrack.info.author} mix`;
            const res = await client.lavalink.loadTracks(searchIdentifier);

            if (res.loadType === 'search' || res.loadType === 'track') {
                const tracks = res.loadType === 'search' ? res.data : [res.data];
                if (tracks && tracks.length > 0) {
                    const existingUris = [
                        ...queue.history.map(t => t.info.uri),
                        ...queue.songs.map(t => t.info.uri),
                        queue.nowPlaying ? queue.nowPlaying.info.uri : null
                    ];

                    const newTracks = tracks.filter(t => !existingUris.includes(t.info.uri));

                    // Shuffle the newTracks to get variety
                    newTracks.sort(() => Math.random() - 0.5);

                    for (const t of newTracks) {
                        if (queue.songs.length >= 5) break;
                        queue.songs.push(t);
                    }
                }
            }
        } catch (e) {
            console.error('[Autoplay Fetching Error]:', e);
        }
    }
}

module.exports = Queue;
