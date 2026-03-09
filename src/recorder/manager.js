import { SlackBrowser } from './browser.js';
import { AudioCapture } from './audio-capture.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('recorder');

/**
 * Orchestrates browser + audio capture for huddle recording.
 * Manages concurrent recording sessions (one per channel).
 */
export class RecordingManager {
    constructor() {
        this.browser = new SlackBrowser();
        this.sessions = new Map(); // channelId → { audioCapture, outputPath, startTime }
    }

    /**
     * Initialize the browser (call once at startup).
     */
    async init() {
        await this.browser.launch();
        log.info('Recording manager initialized');
    }

    /**
     * Start recording a huddle in a channel.
     * @param {string} channelId
     * @returns {boolean} Whether recording started successfully
     */
    async startRecording(channelId) {
        if (this.sessions.has(channelId)) {
            log.warn(`Already recording in channel ${channelId}`);
            return false;
        }

        log.info(`Starting recording for channel ${channelId}`);

        try {
            // Join the huddle via browser
            const joined = await this.browser.joinHuddle(channelId);
            if (!joined) {
                log.error(`Failed to join huddle in channel ${channelId}`);
                return false;
            }

            // Start audio capture
            const audioCapture = new AudioCapture();
            const outputPath = audioCapture.start(channelId);

            this.sessions.set(channelId, {
                audioCapture,
                outputPath,
                startTime: Date.now(),
            });

            log.info(`Recording started for channel ${channelId}`);
            return true;

        } catch (err) {
            log.error(`Error starting recording: ${err.message}`);
            return false;
        }
    }

    /**
     * Stop recording and return the audio file path.
     * @param {string} channelId
     * @returns {Promise<{filePath: string, duration: number}|null>}
     */
    async stopRecording(channelId) {
        const session = this.sessions.get(channelId);
        if (!session) {
            log.warn(`No active recording for channel ${channelId}`);
            return null;
        }

        log.info(`Stopping recording for channel ${channelId}`);

        // Stop audio capture
        const filePath = session.audioCapture.stop();
        const duration = Math.round((Date.now() - session.startTime) / 1000);

        // Leave the huddle
        await this.browser.leaveHuddle();

        // Remove session
        this.sessions.delete(channelId);

        // Wait a moment for FFmpeg to finalize the file
        await new Promise((resolve) => setTimeout(resolve, 2000));

        log.info(`Recording stopped: ${filePath} (${duration}s)`);
        return { filePath, duration };
    }

    /**
     * Clean up a recording file after processing.
     * @param {string} filePath
     */
    cleanup(filePath) {
        const capture = new AudioCapture();
        capture.cleanup(filePath);
    }

    /**
     * Check if a channel is currently being recorded.
     * @param {string} channelId
     * @returns {boolean}
     */
    isRecording(channelId) {
        return this.sessions.has(channelId);
    }

    /**
     * Get status of all active recordings.
     * @returns {Array<{channelId: string, duration: number}>}
     */
    getActiveRecordings() {
        const active = [];
        for (const [channelId, session] of this.sessions) {
            active.push({
                channelId,
                duration: Math.round((Date.now() - session.startTime) / 1000),
            });
        }
        return active;
    }

    /**
     * Shut down — stop all recordings and close browser.
     */
    async shutdown() {
        log.info('Shutting down recording manager...');

        // Stop all active recordings
        for (const channelId of this.sessions.keys()) {
            await this.stopRecording(channelId);
        }

        await this.browser.close();
        log.info('Recording manager shut down');
    }
}
