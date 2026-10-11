class Quest {
    constructor(data) {
        this.data = data;
    }

    static create(data) {
        return new Quest(data);
    }

    get id() { return this.data.id; }
    get config() { return this.data.config; }
    get userStatus() { return this.data.user_status; }
    get targetedContent() { return this.data.targeted_content; }
    get preview() { return this.data.preview; }

    isExpired(reference = new Date()) {
        return reference.getTime() > new Date(this.data.config.expires_at).getTime();
    }

    isCompleted() {
        return Boolean(this.userStatus?.completed_at);
    }

    isEnrolledQuest() {
        return Boolean(this.userStatus?.enrolled_at);
    }

    hasClaimedRewards() {
        return Boolean(this.userStatus?.claimed_at);
    }

    updateUserStatus(userStatus) {
        this.data.user_status = userStatus;
    }
}

module.exports = { Quest };
