
const fs = require('fs');
const path = require('path');

let nvidiaApiKey = '';

function setApiKey(apiKey) {
    nvidiaApiKey = apiKey;
}

function hasApiKey() {
    return Boolean(nvidiaApiKey);
}

async function validateApiKey(apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-ai/deepseek-v4-flash',
                messages: [{ role: 'user', content: 'Reply with OK.' }],
                temperature: 0,
                max_tokens: 8,
                reasoning_effort: 'none'
            })
        });

        if (response.status === 401 || response.status === 403) {
            return {
                valid: false,
                status: 401,
                message: 'NVIDIA rejected this key. Check that it is correct and has API access.'
            };
        }
        if (response.status === 429) {
            return {
                valid: false,
                status: 429,
                message: 'NVIDIA rate-limited the verification request. Please wait and try again.'
            };
        }
        if (response.status === 202) {
            return {
                valid: false,
                status: 503,
                message: 'NVIDIA accepted the key but queued the test request without returning a completion. Please try again shortly.'
            };
        }
        if (!response.ok) {
            return {
                valid: false,
                status: 502,
                message: `NVIDIA could not complete the verification request (HTTP ${response.status}). Check your key access and try again.`
            };
        }

        const data = await response.json();
        if (typeof data.choices?.[0]?.message?.content !== 'string' || !data.choices[0].message.content.trim()) {
            return {
                valid: false,
                status: 502,
                message: 'NVIDIA responded, but did not return a valid chat completion.'
            };
        }

        return { valid: true };
    } catch (error) {
        if (error.name === 'AbortError') {
            return {
                valid: false,
                status: 504,
                message: 'NVIDIA did not respond within 45 seconds. Please try again.'
            };
        }
        console.error('[AI] NVIDIA API key verification failed:', error.message);
        return {
            valid: false,
            status: 502,
            message: 'Could not reach NVIDIA to verify the key. Check your connection and try again.'
        };
    } finally {
        clearTimeout(timeout);
    }
}

function getPaths(client) {
    const folder = client && client.dataFolder ? client.dataFolder : 'data';
    return {
        CONFIG_PATH: path.join(__dirname, '..', folder, 'ai_config.json'),
        HISTORY_PATH: path.join(__dirname, '..', folder, 'chat_history.json')
    };
}



// Default Config
const DEFAULT_CONFIG = {
    global: false,
    enabledServers: [],
    enabledChannels: [],
    dmUsers: [],
    enabledGroups: [], // Always reply
    enabledGroupsMention: [], // Reply only on mention
    freeWillChannels: [],
    aiName: "Kaizen+",
    backstory: "You are Kaizen+, a helpful and witty AI assistant.",
    personality: "Friendly, helpful, and sometimes sarcastic.",
    rules: "Keep responses concise. Do not ping @everyone.",
    modelType: "slow",
    bannedWords: ["age", "year old", "y/o", "birth"],
    disablePing: false,
    blockedUsers: []
};

function loadData(client) {
    try {
        const { CONFIG_PATH } = getPaths(client);
        if (!fs.existsSync(CONFIG_PATH)) {
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4));
            return DEFAULT_CONFIG;
        }
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        if (!raw.trim()) throw new Error('Empty file');

        let data = JSON.parse(raw);
        // Merge with defaults to ensure all fields exist
        data = { ...DEFAULT_CONFIG, ...data };

        return data;
    } catch (e) {
        console.error('[AI Manager] Failed to load config, using defaults:', e.message);
        return DEFAULT_CONFIG;
    }
}

function saveData(client, data) {
    try {
        const { CONFIG_PATH } = getPaths(client);
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // Merge with existing to preserve unseen keys
        const existing = loadData(client);
        const finalData = { ...existing, ...data };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalData, null, 4));
    } catch (e) {
        console.error('[AI Manager] Failed to save config:', e);
    }
}

function loadHistory(client) {
    const { HISTORY_PATH } = getPaths(client);
    if (!fs.existsSync(HISTORY_PATH)) {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify({}, null, 4));
        return {};
    }
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
}

function saveHistory(client, history) {
    const { HISTORY_PATH } = getPaths(client);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 4));
}

function getContext(client, userId, config) {
    const history = loadHistory(client);
    const userHistory = history[userId] || [];

    // System Prompt
    const systemMsg = {
        role: "system",
        content: `Name: ${config.aiName}\nBackstory: ${config.backstory}\nPersonality: ${config.personality}\nRules: ${config.rules}`
    };

    const messages = [systemMsg, ...userHistory];
    return messages;
}

async function addHistory(client, userId, userContent, aiContent) {
    let history = loadHistory(client);
    if (!history[userId]) history[userId] = [];

    history[userId].push({ role: "user", content: userContent });
    history[userId].push({ role: "assistant", content: aiContent });

    // Keep last 10 messages (5 pairs)
    if (history[userId].length > 10) {
        history[userId] = history[userId].slice(history[userId].length - 10);
    }

    saveHistory(client, history);
}

// Core Chat Function
async function generateReply(client, userId, userContent) {
    if (!nvidiaApiKey) {
        console.error('[AI] NVIDIA API key is not configured. Open the AI tab to add it.');
        return null;
    }

    const config = loadData(client);
    const messages = getContext(client, userId, config);

    // Append current message
    messages.push({ role: "user", content: userContent });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nvidiaApiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-ai/deepseek-v4-flash",
                messages: messages,
                temperature: 0.7,
                top_p: 1.0,
                max_tokens: 2048,
                reasoning_effort: 'none'
            })
        });

        if (response.status === 202) {
            throw new Error('NVIDIA accepted the request but queued it without returning a completion.');
        }
        if (!response.ok) {
            throw new Error(`NVIDIA API request failed with status ${response.status}.`);
        }

        const data = await response.json();
        let fullContent = data.choices?.[0]?.message?.content || "";

        console.log('[AI] Reply complete (NVIDIA NIM).');

        // Strip out <think> blocks if the model returns them in the main content chunk
        fullContent = fullContent.replace(/<think>[\s\S]*?(?:<\/think>|$)\s*/gi, '');

        // Save to history
        if (fullContent.trim()) {
            await addHistory(client, userId, userContent, fullContent);
            return fullContent;
        }

        return null;

    } catch (error) {
        console.error("[AI] Error generating reply:", error);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// Initialization and Event Listening
function initialize(client) {
    console.log("[AI System] Initializing...");

    client.on('messageCreate', async (message) => {
        try {
            if (message.author.bot) return;
            // CRITICAL FIX: Prevent self-reply loop & specific crashes
            if (!client.user || message.author.id === client.user.id) return;

            // Ignore system messages and non-text content
            if (message.system || !message.content || !message.content.trim()) return;

            const ignoredTypes = ['RECIPIENT_ADD', 'RECIPIENT_REMOVE', 'CALL', 'CHANNEL_NAME_CHANGE', 'CHANNEL_ICON_CHANGE', 'PINS_ADD'];
            if (ignoredTypes.includes(message.type)) return;

            const config = loadData(client);
            const content = message.content;
            const guildId = message.guild?.id;
            const channelId = message.channel.id;
            const authorId = message.author.id;

            // Banned Words Check
            if (config.bannedWords && config.bannedWords.some(w => content.toLowerCase().includes(w.toLowerCase()))) {
                return;
            }

            // Blocklist Users Check
            if (config.blockedUsers && config.blockedUsers.includes(authorId)) {
                return;
            }

            // Flags
            let shouldReply = false;
            let freeWillDelay = 0;
            let isFreeWill = false;

            // 1. DM Logic (or Group DM)
            if (!guildId) {
                // Check if user is whitelisted for DMs
                if (config.dmUsers && config.dmUsers.includes(authorId)) {
                    shouldReply = true;
                }
                // Check if group/channel is whitelisted (ALWAYS REPLY)
                if (config.enabledGroups && config.enabledGroups.includes(channelId)) {
                    shouldReply = true;
                }
                // Check if group/channel is whitelisted (MENTION ONLY)
                if (config.enabledGroupsMention && config.enabledGroupsMention.includes(channelId)) {
                    if (message.mentions.users.has(client.user.id)) {
                        shouldReply = true;
                    }
                }
            } else {
                // Server Logic

                // Check Free Will
                if (config.freeWillChannels) {
                    const fwItem = config.freeWillChannels.find(x => typeof x === 'object' ? x.id === channelId : x === channelId);
                    if (fwItem) {
                        shouldReply = true;
                        isFreeWill = true;
                        freeWillDelay = typeof fwItem === 'object' ? (fwItem.delay || 0) : 0;
                    }
                }

                // Check Mention/Reply triggers
                if (!isFreeWill) {
                    const isMentioned = message.mentions.users.has(client.user.id);
                    // Reply logic could be added here if needed

                    if (isMentioned) {
                        if (config.global) {
                            shouldReply = true;
                        } else {
                            const serverAllowed = config.enabledServers && config.enabledServers.includes(guildId);
                            const channelAllowed = config.enabledChannels && config.enabledChannels.includes(channelId);
                            if (serverAllowed || channelAllowed) {
                                shouldReply = true;
                            }
                        }
                    }
                }
            }

            if (content.includes('@everyone') || content.includes('@here')) {
                // Ignore logic
            }

            if (shouldReply) {
                const processReply = async () => {
                    const startTime = Date.now();
                    message.channel.sendTyping().catch(() => { });
                    // Generate
                    // Prepend username for context
                    const effectiveContent = `(User: ${message.author.username}) ${content}`;
                    const reply = await generateReply(client, authorId, effectiveContent);

                    if (freeWillDelay > 0) {
                        const timeTaken = Date.now() - startTime;
                        const targetDelayMs = freeWillDelay * 1000;
                        if (targetDelayMs > timeTaken) {
                            await new Promise(resolve => setTimeout(resolve, targetDelayMs - timeTaken));
                        }
                    }

                    if (reply && reply.trim().length > 0) {
                        try {
                            await message.reply({
                                content: reply,
                                allowedMentions: { repliedUser: !config.disablePing }
                            });
                        } catch (e) {
                            // Fallback: If reply fails (e.g. Invalid Form Body), try normal send
                            // console.warn("[AI] Reply failed, attempting plain send...", e.message);
                            await message.channel.send(reply).catch(err => console.error("[AI] Failed to send:", err));
                        }
                    }
                };

                // Free Will Queue System to prevent API rate limits
                if (isFreeWill && freeWillDelay > 0) {
                    if (!client.freeWillQueues) client.freeWillQueues = new Map();
                    const currentQueue = client.freeWillQueues.get(channelId) || Promise.resolve();

                    const nextQueue = currentQueue
                        .then(() => processReply())
                        .catch(err => console.error("[AI Queue Error]:", err));

                    client.freeWillQueues.set(channelId, nextQueue);
                } else {
                    // Normal execution for mentions, whitelisted channels, etc.
                    processReply().catch(err => console.error("[AI Process Error]:", err));
                }
            }
        } catch (error) {
            console.error("Error in AI messageCreate:", error);
        }
    });
}

module.exports = {
    loadData,
    saveData,
    validateApiKey,
    setApiKey,
    hasApiKey,
    initialize
};
