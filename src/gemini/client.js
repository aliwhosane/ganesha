import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('gemini');

let ai = null;

export function getGeminiClient() {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
        log.info(`Initialized Gemini client (model: ${config.gemini.model})`);
    }
    return ai;
}
