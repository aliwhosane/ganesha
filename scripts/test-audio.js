/**
 * Test audio processing with Gemini (standalone, no Slack needed).
 *
 * Usage: node scripts/test-audio.js <path-to-audio-file>
 *
 * Example:
 *   node scripts/test-audio.js ~/recordings/test-meeting.mp3
 */

import 'dotenv/config';
import { processAudio } from '../src/gemini/processor.js';
import { formatMinutesAsText } from '../src/slack/formatter.js';

const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: node scripts/test-audio.js <audio-file-path>');
    console.error('');
    console.error('Supported formats: MP3, WAV, OGG, FLAC, AAC, M4A, WebM');
    process.exit(1);
}

console.log(`🎙️ Processing audio: ${filePath}`);
console.log(`🤖 Model: ${process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'}`);
console.log('⏳ This may take 30-60 seconds...\n');

try {
    const startTime = Date.now();

    const minutes = await processAudio(filePath, {
        date: new Date().toISOString().slice(0, 10),
        channel: 'test',
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('═══════════════════════════════════════════════════');
    console.log(`📋 ${minutes.title}`);
    console.log(`📅 ${minutes.date}  •  ⏱️ ${minutes.duration}  •  🌐 ${minutes.languagesDetected?.join(', ')}`);
    console.log('═══════════════════════════════════════════════════');

    console.log(`\n📝 Summary\n${minutes.summary}`);

    if (minutes.discussionTopics?.length) {
        console.log('\n💬 Discussion Topics');
        minutes.discussionTopics.forEach((t, i) => {
            console.log(`  ${i + 1}. ${t.topic}: ${t.summary}`);
        });
    }

    if (minutes.decisions?.length) {
        console.log('\n🔨 Decisions');
        minutes.decisions.forEach((d) => {
            console.log(`  • ${d.decision}${d.owner ? ` (${d.owner})` : ''}`);
        });
    }

    if (minutes.actionItems?.length) {
        console.log('\n✅ Action Items');
        minutes.actionItems.forEach((a) => {
            const priority = { high: '🔴', medium: '🟡', low: '🟢' }[a.priority] || '⚪';
            console.log(`  ${priority} ${a.task}${a.assignee ? ` → ${a.assignee}` : ''}${a.deadline ? ` (by ${a.deadline})` : ''}`);
        });
    }

    if (minutes.deadlines?.length) {
        console.log('\n📅 Deadlines');
        minutes.deadlines.forEach((d) => {
            console.log(`  • ${d.item} — ${d.date}${d.owner ? ` (${d.owner})` : ''}`);
        });
    }

    if (minutes.feedback?.length) {
        console.log('\n💡 Feedback');
        minutes.feedback.forEach((f) => {
            const emoji = { positive: '👍', negative: '👎', neutral: '💭' }[f.sentiment];
            console.log(`  ${emoji} ${f.about}: ${f.content}`);
        });
    }

    if (minutes.followUps?.length) {
        console.log('\n🔄 Follow-ups');
        minutes.followUps.forEach((f) => {
            console.log(`  • ${f.topic}: ${f.nextSteps}`);
        });
    }

    console.log(`\n⏱️ Processed in ${elapsed}s`);
    console.log('\n📊 Full JSON output:');
    console.log(JSON.stringify(minutes, null, 2));

} catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
}
