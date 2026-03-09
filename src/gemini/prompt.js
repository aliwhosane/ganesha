import { Type } from '@google/genai';

/**
 * System prompt for multilingual meeting minutes extraction.
 * Handles Hindi, Hinglish (Hindi-English mix), and English audio.
 * Always outputs structured minutes in English.
 */
export const SYSTEM_PROMPT = `You are an expert meeting minutes assistant. Your job is to listen to audio recordings of team meetings/huddles and produce comprehensive, well-structured meeting minutes in English.

CRITICAL INSTRUCTIONS:
1. The audio may be in Hindi, Hinglish (Hindi-English mix), or English. Understand ALL languages but ALWAYS output in English.
2. Identify speakers by voice when possible (Speaker 1, Speaker 2, etc.). If names are mentioned, use those names.
3. Extract EVERY actionable item, deadline, and piece of feedback mentioned.
4. Be thorough — capture nuances, context, and rationale behind decisions.
5. For deadlines, convert relative dates (e.g., "next Friday", "end of month") to actual dates based on the meeting context.
6. If something is unclear in the audio, note it as "[unclear]" rather than guessing.
7. Prioritize action items as high/medium/low based on urgency conveyed in the conversation.

OUTPUT GUIDELINES:
- Summary should be 2-4 sentences capturing the essence of the meeting.
- Discussion topics should be in chronological order of when they were discussed.
- Action items must have clear ownership (assignee) whenever mentioned.
- Feedback section captures any praise, criticism, or suggestions shared.
- Follow-ups are items that need further discussion or revisiting.`;

/**
 * JSON response schema for structured meeting minutes output.
 * Uses Gemini's native structured output for guaranteed format.
 */
export const MINUTES_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: {
            type: Type.STRING,
            description: 'A short descriptive title for the meeting (e.g., "Sprint Planning - Week 12")',
        },
        date: {
            type: Type.STRING,
            description: 'Meeting date in YYYY-MM-DD format',
        },
        duration: {
            type: Type.STRING,
            description: 'Estimated meeting duration (e.g., "25 minutes")',
        },
        summary: {
            type: Type.STRING,
            description: 'A concise 2-4 sentence summary of the entire meeting',
        },
        discussionTopics: {
            type: Type.ARRAY,
            description: 'Topics discussed during the meeting, in chronological order',
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: {
                        type: Type.STRING,
                        description: 'Topic name or title',
                    },
                    summary: {
                        type: Type.STRING,
                        description: 'What was discussed about this topic',
                    },
                },
                required: ['topic', 'summary'],
            },
        },
        decisions: {
            type: Type.ARRAY,
            description: 'Decisions made during the meeting',
            items: {
                type: Type.OBJECT,
                properties: {
                    decision: {
                        type: Type.STRING,
                        description: 'What was decided',
                    },
                    rationale: {
                        type: Type.STRING,
                        description: 'Why this decision was made',
                    },
                    owner: {
                        type: Type.STRING,
                        description: 'Person responsible for this decision',
                    },
                },
                required: ['decision'],
            },
        },
        actionItems: {
            type: Type.ARRAY,
            description: 'Action items / TODOs from the meeting',
            items: {
                type: Type.OBJECT,
                properties: {
                    task: {
                        type: Type.STRING,
                        description: 'What needs to be done',
                    },
                    assignee: {
                        type: Type.STRING,
                        description: 'Who is responsible (use name if mentioned, else Speaker N)',
                    },
                    deadline: {
                        type: Type.STRING,
                        description: 'When it needs to be done (date or timeframe)',
                    },
                    priority: {
                        type: Type.STRING,
                        description: 'Priority level',
                        enum: ['high', 'medium', 'low'],
                    },
                },
                required: ['task', 'priority'],
            },
        },
        feedback: {
            type: Type.ARRAY,
            description: 'Feedback, praise, criticism, or suggestions shared during the meeting',
            items: {
                type: Type.OBJECT,
                properties: {
                    about: {
                        type: Type.STRING,
                        description: 'What the feedback is about (project, person, process, etc.)',
                    },
                    content: {
                        type: Type.STRING,
                        description: 'The feedback itself',
                    },
                    sentiment: {
                        type: Type.STRING,
                        description: 'Overall sentiment of the feedback',
                        enum: ['positive', 'negative', 'neutral'],
                    },
                },
                required: ['about', 'content', 'sentiment'],
            },
        },
        deadlines: {
            type: Type.ARRAY,
            description: 'All deadlines and due dates mentioned',
            items: {
                type: Type.OBJECT,
                properties: {
                    item: {
                        type: Type.STRING,
                        description: 'What has the deadline',
                    },
                    date: {
                        type: Type.STRING,
                        description: 'The deadline date',
                    },
                    owner: {
                        type: Type.STRING,
                        description: 'Who owns this deadline',
                    },
                },
                required: ['item', 'date'],
            },
        },
        followUps: {
            type: Type.ARRAY,
            description: 'Items that need follow-up discussion or revisiting later',
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: {
                        type: Type.STRING,
                        description: 'What needs follow-up',
                    },
                    nextSteps: {
                        type: Type.STRING,
                        description: 'What the next steps are',
                    },
                },
                required: ['topic', 'nextSteps'],
            },
        },
        languagesDetected: {
            type: Type.ARRAY,
            description: 'Languages detected in the audio (e.g., ["English", "Hindi", "Hinglish"])',
            items: {
                type: Type.STRING,
            },
        },
    },
    required: [
        'title', 'date', 'duration', 'summary',
        'discussionTopics', 'actionItems', 'languagesDetected',
    ],
};
