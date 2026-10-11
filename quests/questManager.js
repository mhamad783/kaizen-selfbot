const { Quest } = require('./quest');

class QuestManager {
    constructor(client, quests) {
        this.client = client;
        this.quests = quests;
        this.logger = (msg) => console.log(msg); // Default
        this.stopped = false;
        this.abortControllers = new Set();
    }

    setLogger(fn) {
        this.logger = fn;
    }

    log(questId, msg) {
        let prefix = '';
        if (typeof questId === 'string') {
            const q = this.get(questId);
            const name = q ? (q.config.messages.quest_name || q.config.application.name) : questId;
            prefix = `[${name}] `;
        } else {
            msg = questId;
        }
        this.logger(`${prefix}${msg}`);
    }

    static fromResponse(client, response) {
        const quests = response.quests
            .map((quest) => Quest.create(quest))
            .filter((quest) => true);
        return new QuestManager(client, quests);
    }

    list() { return this.quests; }
    filterQuestsValid() { return this.list().filter(q => !q.isCompleted() && !q.isExpired()); }
    get(questId) { return this.quests.find((quest) => quest.id === questId); }

    async enroll(quest) {
        try {
            const res = await this.client.rest.post(`/quests/${quest.id}/enroll`, {
                body: { location: 11, is_targeted: false, metadata_raw: null },
            });
            quest.updateUserStatus(res);
        } catch (error) {
            this.log(quest.id, `Enroll Error: ${error.message}`);
            throw error;
        }
    }

    async heartbeat(questId, applicationId, terminal = false) {
        return this.client.rest.post(`/quests/${questId}/heartbeat`, {
            body: { application_id: applicationId, terminal },
        });
    }

    async videoProgress(questId, timestamp) {
        return this.client.rest.post(`/quests/${questId}/video-progress`, {
            body: { timestamp },
        });
    }

    sleep(ms) {
        return new Promise((resolve, reject) => {
            if (this.stopped) return reject(new Error('Stopped'));
            const timer = setTimeout(resolve, ms);
            const cancel = () => {
                clearTimeout(timer);
                reject(new Error('Stopped'));
            };
            this.abortControllers.add(cancel);
            // Cleanup on resolve
            setTimeout(() => this.abortControllers.delete(cancel), ms);
        });
    }

    async doingQuest(quest) {
        if (this.stopped) return;

        this.log(quest.id, 'Processing...');

        if (!quest.isEnrolledQuest()) {
            this.log(quest.id, 'Enrolling...');
            await this.enroll(quest);
        }

        const config = quest.config.task_config || quest.config.task_config_v2;
        const tasks = config.tasks;

        const playTask = Object.keys(tasks).find(k => k === 'PLAY_ON_DESKTOP');
        const videoTask = Object.keys(tasks).find(k => ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE'].includes(k));

        if (playTask) {
            await this.runPlay(quest, tasks[playTask], playTask);
        } else if (videoTask) {
            await this.runVideo(quest, tasks[videoTask], videoTask);
        } else {
            this.log(quest.id, 'Unsupported Task Type.');
        }
    }

    async runVideo(quest, taskConfig, taskName) {
        this.log(quest.id, 'Task: WATCH_VIDEO');
        const speed = 7;
        const target = taskConfig.target;
        let current = quest.userStatus?.progress?.[taskName]?.value || 0;

        while (current < target && !this.stopped) {
            current = Math.min(target, current + speed);
            try {
                const res = await this.videoProgress(quest.id, current + Math.random());
                if (res.completed_at) {
                    this.log(quest.id, 'COMPLETED!');
                    quest.updateUserStatus(res.user_status);
                    break;
                }
                this.log(quest.id, `Progress: ${Math.floor(current)}/${target}s`);
                await this.sleep(2000);
            } catch (e) {
                if (e.message === 'Stopped') break;
                this.log(quest.id, `Error: ${e.message}`);
                try { await this.sleep(5000); } catch (e) { if (e.message === 'Stopped') break; }
            }
        }

        if (current >= target && !this.stopped) {
            try {
                const res = await this.videoProgress(quest.id, target);
                if (res.completed_at) this.log(quest.id, 'COMPLETED!');
            } catch (e) { }
        }
    }

    async verifyProgress(questId) {
        try {
            const res = await this.client.rest.get('/quests/@me');
            const remoteQuest = res.quests.find(q => q.id === questId);
            return remoteQuest?.user_status?.progress;
        } catch (e) {
            return null;
        }
    }

    async runPlay(quest, taskConfig, taskName) {
        const appId = quest.config.application.id;
        const appName = quest.config.application.name;
        this.log(quest.id, `Task: PLAY_ON_DESKTOP (${appName})`);

        const target = taskConfig.target;
        let current = quest.userStatus?.progress?.[taskName]?.value || 0;

        while (current < target && !this.stopped) {
            try {
                this.log(quest.id, `Heartbeat... Progress: ${current}/${target}s`);
                const res = await this.heartbeat(quest.id, appId, false);
                const newProgress = res.user_status?.progress?.[taskName]?.value;
                if (newProgress) current = newProgress;
                else current += 30;

                if (current >= target) {
                    this.log(quest.id, 'Target reached locally. Verifying...');
                    const realProgressObj = await this.verifyProgress(quest.id);
                    const realValue = realProgressObj?.[taskName]?.value;

                    if (realValue !== undefined && realValue < target) {
                        this.log(quest.id, `Correction: Real progress is ${realValue}/${target}s. Continuing...`);
                        current = realValue;
                        await this.sleep(30000);
                        continue;
                    }

                    await this.heartbeat(quest.id, appId, true);
                    this.log(quest.id, 'COMPLETED!');
                    break;
                }
                await this.sleep(30000);
            } catch (e) {
                if (e.message === 'Stopped') break;
                this.log(quest.id, `Heartbeat Error: ${e.message}`);
                try { await this.sleep(5000); } catch (e) { if (e.message === 'Stopped') break; }
            }
        }
    }

    stopAll() {
        this.stopped = true;
        this.abortControllers.forEach(cancel => cancel());
        this.abortControllers.clear();
    }
}

module.exports = { QuestManager };
