import { chromium } from 'playwright';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('browser');

/**
 * Manages a Playwright browser session that can join Slack huddles.
 * Uses persistent context to maintain login state.
 */
export class SlackBrowser {
    constructor() {
        this.context = null;
        this.page = null;
        this.isReady = false;
    }

    /**
     * Launch browser with persistent session.
     * The session directory contains Slack login cookies from the one-time setup.
     */
    async launch() {
        if (this.context) {
            log.warn('Browser already launched');
            return;
        }

        log.info('Launching browser with persistent session...');

        this.context = await chromium.launchPersistentContext(config.browser.userDataDir, {
            headless: false,  // Required for audio — headless Chrome can't do WebRTC audio properly
            args: [
                '--disable-gpu',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--use-fake-ui-for-media-stream',     // Auto-accept mic/camera permissions
                '--autoplay-policy=no-user-gesture-required',
                '--enable-audio-output',
                '--disable-features=AudioServiceOutOfProcess',  // Keep audio in-process
            ],
            ignoreDefaultArgs: ['--mute-audio'],  // Ensure audio is NOT muted
            viewport: { width: 1280, height: 720 },
        });

        this.page = this.context.pages()[0] || await this.context.newPage();
        this.isReady = true;
        log.info('Browser launched successfully');
    }

    /**
     * Navigate to a Slack channel and join the active huddle.
     * @param {string} channelId - Slack channel ID
     * @returns {boolean} Whether successfully joined
     */
    async joinHuddle(channelId) {
        if (!this.isReady) {
            await this.launch();
        }

        try {
            // Navigate to the channel in Slack
            const channelUrl = `${config.slack.workspaceUrl}/archives/${channelId}`;
            log.info(`Navigating to channel: ${channelUrl}`);
            await this.page.goto(channelUrl, { waitUntil: 'networkidle', timeout: 30000 });

            // Wait for Slack to fully load
            await this.page.waitForTimeout(3000);

            // Look for the huddle indicator / join button
            // Slack's huddle UI typically shows a headphone icon or "Join" button
            const huddleSelectors = [
                // Active huddle indicator in channel header
                '[data-qa="huddle_join_button"]',
                '[data-qa="huddle-join-button"]',
                'button[aria-label*="huddle" i]',
                'button[aria-label*="Join" i]',
                // Fallback: look for any huddle-related button
                '[class*="huddle"] button',
                '[class*="Huddle"] button',
            ];

            let joined = false;
            for (const selector of huddleSelectors) {
                try {
                    const button = await this.page.waitForSelector(selector, { timeout: 5000 });
                    if (button) {
                        await button.click();
                        log.info(`Clicked huddle join button: ${selector}`);
                        joined = true;
                        break;
                    }
                } catch {
                    // Selector not found, try next
                }
            }

            if (!joined) {
                // Alternative: Try keyboard shortcut (Ctrl+Shift+H) to toggle huddle
                log.info('Trying keyboard shortcut to join huddle...');
                await this.page.keyboard.press('Control+Shift+h');
                await this.page.waitForTimeout(2000);
                joined = true; // Assume success — we'll verify via audio capture
            }

            await this.page.waitForTimeout(2000);
            log.info(`Huddle join attempt complete for channel ${channelId}`);
            return joined;

        } catch (err) {
            log.error(`Failed to join huddle: ${err.message}`);
            return false;
        }
    }

    /**
     * Leave the current huddle.
     */
    async leaveHuddle() {
        try {
            // Try clicking the leave/hang-up button
            const leaveSelectors = [
                '[data-qa="huddle_leave_button"]',
                '[data-qa="huddle-leave-button"]',
                'button[aria-label*="Leave" i]',
                'button[aria-label*="hang up" i]',
                '[class*="huddle"] [class*="leave"]',
            ];

            for (const selector of leaveSelectors) {
                try {
                    const button = await this.page.waitForSelector(selector, { timeout: 3000 });
                    if (button) {
                        await button.click();
                        log.info('Left huddle via button');
                        return;
                    }
                } catch {
                    // Try next
                }
            }

            // Fallback: keyboard shortcut
            await this.page.keyboard.press('Control+Shift+h');
            log.info('Left huddle via keyboard shortcut');

        } catch (err) {
            log.warn(`Error leaving huddle: ${err.message}`);
        }
    }

    /**
     * Close the browser and clean up.
     */
    async close() {
        if (this.context) {
            log.info('Closing browser...');
            await this.context.close();
            this.context = null;
            this.page = null;
            this.isReady = false;
        }
    }
}
