/**
 * One-time Slack login script.
 *
 * Opens a visible browser window so you can log into Slack manually.
 * The session cookies are saved to the persistent context directory.
 * After this, the bot can use the session to join huddles automatically.
 *
 * Usage: node scripts/login-slack.js
 */

import { chromium } from 'playwright';
import { resolve } from 'path';
import 'dotenv/config';

const USER_DATA_DIR = resolve(process.env.SLACK_USER_DATA_DIR || './data/slack-session');
const WORKSPACE_URL = process.env.SLACK_WORKSPACE_URL || 'https://app.slack.com';

console.log('🔑 Slack Login Setup');
console.log('====================');
console.log(`Session directory: ${USER_DATA_DIR}`);
console.log(`Workspace URL: ${WORKSPACE_URL}`);
console.log('');
console.log('A browser window will open. Please:');
console.log('  1. Log into your Slack workspace');
console.log('  2. Use the bot account (e.g., minutes-bot@yourcompany.com)');
console.log('  3. Once logged in, close the browser window');
console.log('');

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
    ],
    viewport: { width: 1280, height: 800 },
});

const page = context.pages()[0] || await context.newPage();
await page.goto(WORKSPACE_URL);

console.log('⏳ Waiting for you to log in...');
console.log('   Close the browser window when done.');

// Wait for browser to be closed by user
await new Promise((resolve) => {
    context.on('close', resolve);
});

console.log('');
console.log('✅ Session saved! The bot can now join huddles automatically.');
console.log(`   Session stored in: ${USER_DATA_DIR}`);
console.log('');
console.log('Start the bot with: npm start');
