import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('audio');

/**
 * Manages audio capture from PulseAudio virtual sink using FFmpeg.
 * Records browser audio output to MP3 files.
 */
export class AudioCapture {
    constructor() {
        this.ffmpegProcess = null;
        this.outputPath = null;
        this.isRecording = false;
    }

    /**
     * Start recording audio from PulseAudio monitor.
     * @param {string} sessionId - Unique ID for this recording session
     * @returns {string} Path to the output MP3 file
     */
    start(sessionId) {
        if (this.isRecording) {
            log.warn('Already recording, stopping previous session first');
            this.stop();
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.outputPath = join(config.recording.dir, `huddle-${sessionId}-${timestamp}.mp3`);

        // FFmpeg: record from PulseAudio default monitor source
        // Mono, 16kHz (Gemini downsamples to 16kHz anyway), 64kbps (cost-effective)
        const args = [
            '-f', 'pulse',
            '-i', 'virtual_speaker.monitor',  // PulseAudio monitor source
            '-ac', '1',                        // Mono
            '-ar', '16000',                    // 16kHz sample rate
            '-b:a', '64k',                     // 64kbps bitrate
            '-y',                              // Overwrite if exists
            this.outputPath,
        ];

        log.info(`Starting audio capture → ${this.outputPath}`);
        this.ffmpegProcess = spawn('ffmpeg', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
            log.debug(`FFmpeg: ${data.toString().trim()}`);
        });

        this.ffmpegProcess.on('error', (err) => {
            log.error(`FFmpeg error: ${err.message}`);
            this.isRecording = false;
        });

        this.ffmpegProcess.on('close', (code) => {
            log.info(`FFmpeg exited with code ${code}`);
            this.isRecording = false;
        });

        this.isRecording = true;

        // Safety: auto-stop after max duration
        this._safetyTimer = setTimeout(() => {
            if (this.isRecording) {
                log.warn(`Max recording duration reached (${config.recording.maxDuration / 1000}s), auto-stopping`);
                this.stop();
            }
        }, config.recording.maxDuration);

        return this.outputPath;
    }

    /**
     * Stop recording and return the output file path.
     * @returns {string|null} Path to the recorded MP3, or null if not recording
     */
    stop() {
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer);
            this._safetyTimer = null;
        }

        if (!this.ffmpegProcess || !this.isRecording) {
            log.warn('Not currently recording');
            return null;
        }

        log.info('Stopping audio capture...');

        // Send 'q' to FFmpeg for graceful stop (writes proper file headers)
        this.ffmpegProcess.stdin.write('q');
        this.ffmpegProcess.stdin.end();
        this.isRecording = false;

        const outputPath = this.outputPath;
        this.ffmpegProcess = null;
        this.outputPath = null;

        return outputPath;
    }

    /**
     * Clean up a recording file after processing.
     * @param {string} filePath
     */
    cleanup(filePath) {
        try {
            if (filePath && existsSync(filePath)) {
                unlinkSync(filePath);
                log.info(`Cleaned up recording: ${filePath}`);
            }
        } catch (err) {
            log.warn(`Failed to clean up ${filePath}: ${err.message}`);
        }
    }
}
