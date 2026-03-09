import App from '@slack/bolt';
import { config } from './config.js';
import { RecordingManager } from './recorder/manager.js';
import { HuddleListener } from './slack/huddle-listener.js';
import { registerCommands } from './slack/commands.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('app');

async function main() {
    log.info('Starting Huddle Minutes Bot...');

    // Initialize Slack Bolt app in Socket Mode (no server needed)
    const app = new App.default({
        token: config.slack.botToken,
        appToken: config.slack.appToken,
        signingSecret: config.slack.signingSecret,
        socketMode: true,
    });

    // Initialize recording manager
    const recordingManager = new RecordingManager();

    // Register event listeners
    const huddleListener = new HuddleListener(app, recordingManager);

    // Register slash commands
    registerCommands(app, recordingManager);

    // Start the bot
    await app.start();
    log.info('⚡ Huddle Minutes Bot is running!');
    log.info(`   Workspace: ${config.slack.workspaceUrl}`);
    log.info(`   Model: ${config.gemini.model}`);
    log.info(`   Join delay: ${config.recording.joinDelay / 1000}s`);

    // Initialize browser (lazy — will launch when first huddle is detected)
    // We don't launch eagerly to save resources when no huddles are active
    log.info('Browser will launch when first huddle is detected.');

    // Graceful shutdown
    const shutdown = async (signal) => {
        log.info(`${signal} received, shutting down...`);
        await recordingManager.shutdown();
        await app.stop();
        log.info('Goodbye! 👋');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    log.error('Fatal error:', err);
    process.exit(1);
});
