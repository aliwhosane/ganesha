import { processAudio } from '../gemini/processor.js';
import { formatMinutesAsBlocks, formatMinutesAsText } from './formatter.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

const log = createLogger('huddle');

/**
 * Tracks active huddles and orchestrates recording lifecycle.
 *
 * Flow:
 * 1. user_huddle_changed fires when someone joins/leaves a huddle
 * 2. When first user joins → wait joinDelay → start recording
 * 3. When last user leaves → stop recording → process audio → post minutes
 */
export class HuddleListener {
    /**
     * @param {import('@slack/bolt').App} app - Slack Bolt app
     * @param {import('../recorder/manager.js').RecordingManager} recordingManager
     */
    constructor(app, recordingManager) {
        this.app = app;
        this.recorder = recordingManager;
        this.activeHuddles = new Map(); // channelId → { users: Set, joinTimer, channelName }

        this._registerEvents();
    }

    _registerEvents() {
        // Listen for huddle state changes
        this.app.event('user_huddle_changed', async ({ event, client }) => {
            await this._handleHuddleChange(event, client);
        });

        log.info('Huddle listener registered');
    }

    async _handleHuddleChange(event, client) {
        const { user } = event;

        try {
            // Get user's huddle state
            const userInfo = await client.users.info({ user: user.id || user });
            const profile = userInfo.user;
            const userName = profile.real_name || profile.name || user.id || user;

            // Check if user is currently in a huddle
            const huddle = profile.profile?.huddle_state;
            const isInHuddle = huddle && huddle.in_a_huddle;
            const channelId = huddle?.channel_id;

            if (isInHuddle && channelId) {
                await this._userJoinedHuddle(channelId, userName, client);
            } else {
                // User left — find which huddle they were in
                await this._userLeftHuddle(userName, client);
            }
        } catch (err) {
            log.error(`Error handling huddle change: ${err.message}`);
        }
    }

    async _userJoinedHuddle(channelId, userName, client) {
        let huddle = this.activeHuddles.get(channelId);

        if (!huddle) {
            // New huddle detected
            let channelName = channelId;
            try {
                const info = await client.conversations.info({ channel: channelId });
                channelName = info.channel.name;
            } catch { /* use channelId as fallback */ }

            huddle = { users: new Set(), joinTimer: null, channelName };
            this.activeHuddles.set(channelId, huddle);
            log.info(`New huddle detected in #${channelName}`);
        }

        huddle.users.add(userName);
        log.info(`${userName} joined huddle in #${huddle.channelName} (${huddle.users.size} participants)`);

        // Start join timer if not already running (wait before joining to skip brief huddles)
        if (!huddle.joinTimer && !this.recorder.isRecording(channelId)) {
            log.info(`Waiting ${config.recording.joinDelay / 1000}s before joining huddle...`);

            huddle.joinTimer = setTimeout(async () => {
                if (this.activeHuddles.has(channelId) && this.activeHuddles.get(channelId).users.size > 0) {
                    // Post announcement
                    try {
                        await client.chat.postMessage({
                            channel: channelId,
                            text: '🎙️ Minutes Bot is joining this huddle to record meeting minutes. I\'ll post them when the huddle ends!',
                        });
                    } catch (err) {
                        log.warn(`Failed to post join message: ${err.message}`);
                    }

                    // Start recording
                    await this.recorder.startRecording(channelId);
                }
            }, config.recording.joinDelay);
        }
    }

    async _userLeftHuddle(userName, client) {
        // Find which huddle this user was in
        for (const [channelId, huddle] of this.activeHuddles) {
            if (huddle.users.has(userName)) {
                huddle.users.delete(userName);
                log.info(`${userName} left huddle in #${huddle.channelName} (${huddle.users.size} remaining)`);

                // If no real users left (only bot), end the recording
                if (huddle.users.size === 0) {
                    log.info(`Huddle ended in #${huddle.channelName}`);

                    // Clear join timer if it's still pending
                    if (huddle.joinTimer) {
                        clearTimeout(huddle.joinTimer);
                    }

                    this.activeHuddles.delete(channelId);

                    // Stop recording and process
                    if (this.recorder.isRecording(channelId)) {
                        await this._processRecording(channelId, huddle.channelName, client);
                    }
                }
                return;
            }
        }
    }

    async _processRecording(channelId, channelName, client) {
        try {
            // Post processing indicator
            const statusMsg = await client.chat.postMessage({
                channel: channelId,
                text: '⏳ Huddle ended! Processing audio and generating meeting minutes...',
            });

            // Stop recording
            const result = await this.recorder.stopRecording(channelId);
            if (!result || !result.filePath) {
                await client.chat.update({
                    channel: channelId,
                    ts: statusMsg.ts,
                    text: '⚠️ No audio was captured from this huddle. The recording may have been too short.',
                });
                return;
            }

            log.info(`Processing ${result.duration}s recording from #${channelName}`);

            // Skip very short recordings (< 30 seconds = likely accidental)
            if (result.duration < 30) {
                log.info('Recording too short (< 30s), skipping processing');
                await client.chat.update({
                    channel: channelId,
                    ts: statusMsg.ts,
                    text: '⏭️ Huddle was too short (< 30 seconds) — skipping minutes generation.',
                });
                this.recorder.cleanup(result.filePath);
                return;
            }

            // Process with Gemini
            const minutes = await processAudio(result.filePath, {
                channel: channelName,
                date: new Date().toISOString().slice(0, 10),
            });

            // Post formatted minutes
            const blocks = formatMinutesAsBlocks(minutes);
            const text = formatMinutesAsText(minutes);

            await client.chat.update({
                channel: channelId,
                ts: statusMsg.ts,
                text,
                blocks,
            });

            log.info(`Minutes posted to #${channelName}: "${minutes.title}"`);

            // Clean up audio file
            this.recorder.cleanup(result.filePath);

        } catch (err) {
            log.error(`Error processing recording: ${err.message}`);
            try {
                await client.chat.postMessage({
                    channel: channelId,
                    text: `❌ Error generating meeting minutes: ${err.message}. Please try again or upload the audio manually with \`/minutes\`.`,
                });
            } catch { /* best effort */ }
        }
    }
}
