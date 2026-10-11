const { ClientQuest } = require('./client');

class QuestManagerBridge {
    constructor(token) {
        this.token = token.replace('Bot ', '');
        this.client = new ClientQuest(this.token);

        this.client.connect().catch(err => {
            this.log('system', `Gateway Error: ${err.message}`);
        });

        this.globalLogs = [];
        this.activeManager = null;
        this.isRunning = false;
    }

    get activeQuests() { return new Map(); }

    log(questId, msg) {
        let line = '';
        const time = new Date().toLocaleTimeString();

        if (msg) {
            line = msg;
        } else {
            line = questId;
        }

        if (!line.startsWith('[')) {
            line = `[${time}] ${line}`;
        }

        this.globalLogs.push(line);
        if (this.globalLogs.length > 500) this.globalLogs.shift();
    }

    clearLogs() {
        this.globalLogs = [];
        this.log('system', 'Logs cleared.');
    }

    async startAll() {
        if (this.isRunning) {
            this.log('system', 'Already running.');
            return;
        }

        this.isRunning = true;
        this.log('system', 'Starting Quest Protocol...');

        try {
            const manager = await this.client.fetchQuests();
            this.activeManager = manager;

            manager.setLogger((msg) => this.log(msg));

            const validQuests = manager.filterQuestsValid();
            this.log('system', `Found ${validQuests.length} valid quests.`);

            if (validQuests.length === 0) {
                this.log('system', 'No quests to do.');
                this.isRunning = false;
                return;
            }

            const promises = validQuests.map(async (q) => {
                await new Promise(r => setTimeout(r, Math.random() * 5000));
                try {
                    await manager.doingQuest(q);
                } catch (e) {
                    if (e.message !== 'Stopped') {
                        this.log(q.id, `Error: ${e.message}`);
                    }
                }
            });

            await Promise.all(promises);
            this.log('system', 'All quests finished processing.');

        } catch (error) {
            this.log('system', `Critical Error: ${error.message}`);
        } finally {
            this.isRunning = false;
            this.activeManager = null;
        }
    }

    stopAll() {
        if (this.activeManager) {
            this.activeManager.stopAll();
            this.log('system', 'Stopping all tasks immediately...');
        } else {
            this.log('system', 'Nothing to stop.');
        }
    }
}

module.exports = QuestManagerBridge;
