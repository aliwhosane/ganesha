import 'dotenv/config';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    console.error(`   Copy .env.example to .env and fill in the values.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  // Slack
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
    signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
    workspaceUrl: requireEnv('SLACK_WORKSPACE_URL'),
  },

  // Gemini
  gemini: {
    apiKey: requireEnv('GEMINI_API_KEY'),
    model: 'gemini-3.1-flash-lite-preview',
  },

  // Playwright
  browser: {
    userDataDir: resolve(process.env.SLACK_USER_DATA_DIR || './data/slack-session'),
  },

  // Recording
  recording: {
    dir: process.env.RECORDINGS_DIR || '/tmp/huddle-recordings',
    joinDelay: parseInt(process.env.HUDDLE_JOIN_DELAY || '30', 10) * 1000,
    maxDuration: parseInt(process.env.MAX_RECORDING_DURATION || '14400', 10) * 1000,
  },
};

// Ensure directories exist
mkdirSync(config.browser.userDataDir, { recursive: true });
mkdirSync(config.recording.dir, { recursive: true });
