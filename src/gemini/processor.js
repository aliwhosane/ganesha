import { readFileSync } from 'fs';
import { basename } from 'path';
import { createPartFromUri } from '@google/genai';
import { getGeminiClient } from './client.js';
import { SYSTEM_PROMPT, MINUTES_SCHEMA } from './prompt.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('processor');

/**
 * MIME type map for audio formats supported by Gemini.
 */
const MIME_TYPES = {
    '.mp3': 'audio/mp3',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
};

/**
 * Get MIME type from file extension.
 */
function getMimeType(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    return MIME_TYPES[ext] || 'audio/mp3';
}

/**
 * Process an audio file and generate structured meeting minutes.
 *
 * @param {string} audioFilePath - Path to the audio file
 * @param {object} [context] - Optional context (channel name, participants, etc.)
 * @returns {Promise<object>} Structured meeting minutes JSON
 */
export async function processAudio(audioFilePath, context = {}) {
    const ai = getGeminiClient();
    const mimeType = getMimeType(audioFilePath);
    const fileName = basename(audioFilePath);

    log.info(`Processing audio: ${fileName} (${mimeType})`);

    // Upload audio to Gemini Files API
    log.info('Uploading audio to Gemini Files API...');
    const uploadedFile = await ai.files.upload({
        file: audioFilePath,
        config: { mimeType },
    });
    log.info(`Upload complete: ${uploadedFile.uri}`);

    // Build the prompt with optional context
    let contextPrompt = '';
    if (context.channel) {
        contextPrompt += `\nChannel: #${context.channel}`;
    }
    if (context.participants && context.participants.length > 0) {
        contextPrompt += `\nParticipants: ${context.participants.join(', ')}`;
    }
    if (context.date) {
        contextPrompt += `\nMeeting Date: ${context.date}`;
    }

    const userPrompt = `Generate comprehensive meeting minutes from this audio recording.${contextPrompt}

Analyze the entire recording carefully. Extract ALL discussion points, decisions, action items, deadlines, and feedback. Output everything in English even if the audio is in Hindi or Hinglish.`;

    // Call Gemini with structured output
    log.info('Generating meeting minutes with Gemini...');
    const response = await ai.models.generateContent({
        model: config.gemini.model,
        contents: {
            parts: [
                { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
                { text: userPrompt },
            ],
        },
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: MINUTES_SCHEMA,
        },
    });

    const minutes = JSON.parse(response.text);
    log.info(`Minutes generated: "${minutes.title}" (${minutes.duration})`);

    // Clean up uploaded file (fire and forget)
    ai.files.delete({ name: uploadedFile.name }).catch((err) => {
        log.warn(`Failed to delete uploaded file: ${err.message}`);
    });

    return minutes;
}

// === Standalone test mode ===
// Run: node src/gemini/processor.js <audio-file-path>
if (process.argv[1]?.endsWith('processor.js') && process.argv[2]) {
    const filePath = process.argv[2];
    log.info(`Standalone test mode — processing: ${filePath}`);

    processAudio(filePath, { date: new Date().toISOString().slice(0, 10) })
        .then((minutes) => {
            console.log('\n📋 Meeting Minutes:\n');
            console.log(JSON.stringify(minutes, null, 2));
        })
        .catch((err) => {
            log.error('Failed to process audio:', err);
            process.exit(1);
        });
}
