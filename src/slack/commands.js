import { processAudio } from '../gemini/processor.js';
import { formatMinutesAsBlocks, formatMinutesAsText } from './formatter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('commands');

/**
 * Register slash commands for the bot.
 * @param {import('@slack/bolt').App} app
 * @param {import('../recorder/manager.js').RecordingManager} recordingManager
 */
export function registerCommands(app, recordingManager) {

    /**
     * /minutes — Process an uploaded audio file and generate meeting minutes.
     * Usage: Upload an audio file to the channel, then type /minutes
     */
    app.command('/minutes', async ({ command, ack, client, respond }) => {
        await ack();

        log.info(`/minutes triggered by ${command.user_name} in #${command.channel_name}`);

        try {
            // Find the most recent audio file in the channel
            const result = await client.files.list({
                channel: command.channel_id,
                types: 'audio',
                count: 5,
            });

            const audioFile = result.files?.find((f) =>
                f.mimetype?.startsWith('audio/') ||
                f.filetype?.match(/^(mp3|wav|ogg|flac|aac|m4a|webm|mp4)$/)
            );

            if (!audioFile) {
                await respond({
                    text: '⚠️ No audio file found in this channel. Please upload an audio recording first, then use `/minutes`.',
                    response_type: 'ephemeral',
                });
                return;
            }

            await respond({
                text: `⏳ Processing audio file: *${audioFile.name}* (${Math.round(audioFile.size / 1024)}KB)...\nThis may take 30-60 seconds.`,
                response_type: 'in_channel',
            });

            // Download the audio file
            const { default: fs } = await import('fs');
            const { default: path } = await import('path');
            const { default: https } = await import('https');
            const { default: http } = await import('http');

            const tmpPath = path.join('/tmp', `minutes-${Date.now()}-${audioFile.name}`);

            // Download with Slack auth
            await new Promise((resolve, reject) => {
                const url = new URL(audioFile.url_private_download || audioFile.url_private);
                const client = url.protocol === 'https:' ? https : http;

                client.get(url, {
                    headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                }, (res) => {
                    if (res.statusCode === 302 || res.statusCode === 301) {
                        // Follow redirect
                        const redirectClient = res.headers.location.startsWith('https') ? https : http;
                        redirectClient.get(res.headers.location, {
                            headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
                        }, (res2) => {
                            const fileStream = fs.createWriteStream(tmpPath);
                            res2.pipe(fileStream);
                            fileStream.on('finish', resolve);
                            fileStream.on('error', reject);
                        });
                    } else {
                        const fileStream = fs.createWriteStream(tmpPath);
                        res.pipe(fileStream);
                        fileStream.on('finish', resolve);
                        fileStream.on('error', reject);
                    }
                }).on('error', reject);
            });

            // Process with Gemini
            const minutes = await processAudio(tmpPath, {
                channel: command.channel_name,
                date: new Date().toISOString().slice(0, 10),
            });

            // Post formatted minutes
            const blocks = formatMinutesAsBlocks(minutes);
            const text = formatMinutesAsText(minutes);

            await client.chat.postMessage({
                channel: command.channel_id,
                text,
                blocks,
            });

            // Clean up
            fs.unlinkSync(tmpPath);
            log.info(`Minutes generated for /minutes command: "${minutes.title}"`);

        } catch (err) {
            log.error(`Error in /minutes command: ${err.message}`);
            await respond({
                text: `❌ Error processing audio: ${err.message}`,
                response_type: 'ephemeral',
            });
        }
    });

    /**
     * /minutes-status — Show bot status and active recordings.
     */
    app.command('/minutes-status', async ({ command, ack, respond }) => {
        await ack();

        const active = recordingManager.getActiveRecordings();

        if (active.length === 0) {
            await respond({
                text: '✅ *Huddle Minutes Bot* is running.\n📡 No active recordings right now.',
                response_type: 'ephemeral',
            });
        } else {
            let statusText = '✅ *Huddle Minutes Bot* is running.\n\n🔴 *Active Recordings:*\n';
            active.forEach((r) => {
                const mins = Math.floor(r.duration / 60);
                const secs = r.duration % 60;
                statusText += `\n• <#${r.channelId}> — recording for ${mins}m ${secs}s`;
            });
            await respond({
                text: statusText,
                response_type: 'ephemeral',
            });
        }
    });

    log.info('Slash commands registered: /minutes, /minutes-status');
}
