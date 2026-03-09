# 🎙️ Huddle Minutes Bot

Slack bot that **automatically joins huddles**, **records audio**, and **generates AI-powered meeting minutes** — in English, even from Hindi/Hinglish conversations.

**Cost**: ~$18.58/month for 100 meetings (Gemini API + AWS t3.small server).

---

## How It Works

```
Team starts huddle → Bot auto-joins → Records audio → Huddle ends
→ Gemini AI processes audio → Structured minutes posted to channel ✨
```

### What You Get

Every huddle produces a complete meeting summary with:
- 📝 **Summary** — 2-4 sentence overview  
- 💬 **Discussion Topics** — What was talked about
- 🔨 **Decisions** — What was decided and why
- ✅ **Action Items** — TODOs with assignee, deadline, and priority
- 📅 **Deadlines** — All dates and due dates mentioned
- 💡 **Feedback** — Praise, criticism, and suggestions
- 🔄 **Follow-ups** — Items needing future discussion

### Language Support

The bot understands **Hindi**, **Hinglish** (Hindi-English mix), and **English** audio. All output is always in English.

---

## Setup Guide

### Prerequisites

- AWS account with EC2 (Ubuntu or Amazon Linux) running (any Linux server with 2GB+ RAM)
- [Slack workspace](https://slack.com) (you're an admin)
- [Google AI Studio API key](https://aistudio.google.com/apikey)

### Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Give it a name (e.g., "Minutes Bot") and select your workspace

3. **Enable Socket Mode**:
   - Settings → Socket Mode → Toggle ON
   - Generate an App-Level Token with `connections:write` scope
   - Save the token (starts with `xapp-`)

4. **Add Bot Scopes** (OAuth & Permissions → Bot Token Scopes):
   - `channels:read`
   - `channels:history`
   - `chat:write`
   - `commands`
   - `files:read`
   - `users:read`

5. **Subscribe to Events** (Event Subscriptions → Toggle ON → Subscribe to bot events):
   - `user_huddle_changed`

6. **Create Slash Commands** (Slash Commands → Create New Command):
   - `/minutes` — "Generate meeting minutes from the last audio file"
   - `/minutes-status` — "Check bot status and active recordings"

7. **Install the App** to your workspace → Copy the Bot Token (starts with `xoxb-`)

### Step 2: Create a Bot Slack User

Create a separate Slack user for the bot (e.g., `meeting-bot@yourcompany.com`). This is the account that will visibly join huddles. Your team will see "Meeting Bot" as a participant.

### Step 3: Set Up the Server

SSH into your AWS EC2 instance:

```bash
# Install git (if not already installed)
# For Ubuntu: sudo apt update && sudo apt install -y git
# For Amazon Linux: sudo yum update -y && sudo yum install -y git

# Clone the project
git clone <your-repo-url>
cd ganesha

# Run server setup (installs Xvfb, PulseAudio, FFmpeg, Node.js)
chmod +x scripts/setup-audio.sh
./scripts/setup-audio.sh
```

### Step 4: Configure Environment

```bash
cp .env.example .env
nano .env
# Fill in all the values (Slack tokens, Gemini key, workspace URL)
```

### Step 5: Install & Login

```bash
# Install npm dependencies
npm install

# Install Playwright browsers (Wait for npm install to finish first!)
npx playwright install chromium
npx playwright install-deps chromium
```

#### Authentication
You must log into Slack once to create a persistent session block.

**If you are on a desktop (Local):**
```bash
node scripts/login-slack.js
# A window will open. Log in as the bot user, then close the window.
```

**If you are on a headless server (AWS EC2 / Cloud VM):**
Because you cannot see the browser on a headless cloud server, you must generate the session locally on your own computer first:
1. Clone this project on your *local personal computer* (Mac/Windows).
2. Run `npm install` and `node scripts/login-slack.js` locally.
3. Log into Slack when the browser opens.
4. Compress the generated session folder: `tar -czvf session.tar.gz ./data/slack-session`
5. Upload `session.tar.gz` to your EC2 instance (e.g., via `scp`).
6. On the EC2 server, extract it: `tar -xzvf session.tar.gz`

### Step 6: Start the Bot

```bash
# Start with PM2 (auto-restarts on crash)
DISPLAY=:99 pm2 start src/app.js --name huddle-bot

# View logs
pm2 logs huddle-bot

# Auto-start on server reboot
pm2 save
pm2 startup
```

---

## Usage

### Automatic Mode (Default)
Just start a huddle! The bot will:
1. Wait 30 seconds (configurable, skips brief/accidental huddles)
2. Join the huddle and announce itself
3. Record audio throughout
4. When everyone leaves, process and post minutes to the channel

### Manual Mode (`/minutes`)
1. Upload an audio file (MP3, WAV, etc.) to any channel where the bot is present
2. Type `/minutes`
3. The bot processes the most recent audio file and posts meeting minutes

### Check Status (`/minutes-status`)
Type `/minutes-status` to see if the bot is running and any active recordings.

---

## Testing Without Slack

Test the Gemini audio processing locally:

```bash
# Process any audio file
node scripts/test-audio.js path/to/meeting-recording.mp3
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Slack (Cloud)                       │
│  user_huddle_changed events ↕ Block Kit messages     │
└──────────────┬──────────────────────┬───────────────┘
               │ Socket Mode          │
┌──────────────▼──────────────────────▼───────────────┐
│              Slack Bot (Node.js)                     │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Huddle       │  │ Slash    │  │ Formatter      │  │
│  │ Listener     │  │ Commands │  │ (Block Kit)    │  │
│  └──────┬──────┘  └─────┬────┘  └───────┬────────┘  │
│         │               │               │            │
│  ┌──────▼───────────────▼───────────────▼────────┐  │
│  │         Recording Manager                      │  │
│  │  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │ Playwright    │  │ FFmpeg + PulseAudio    │  │  │
│  │  │ (Browser)     │  │ (Audio Capture)        │  │  │
│  │  └──────────────┘  └────────────────────────┘  │  │
│  └────────────────────────┬──────────────────────┘  │
│                           │                          │
│  ┌────────────────────────▼──────────────────────┐  │
│  │         Gemini AI Processor                    │  │
│  │  Upload audio → Structured prompt → JSON out   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Cost Breakdown

| Component | Cost |
|---|---|
| AWS EC2 Instance (t3.small) | **~$15.18/month** (required for 2GB RAM) |
| Gemini 3.1 Flash Lite (30-min meeting) | **~$0.034** |
| 100 meetings/month | **~$3.40/month** (API) + **$15.18** (Server) |
| **Total Estimated Cost** | **~$18.58/month** |

---

## Configuration

| Variable | Description | Default |
|---|---|---|
| `HUDDLE_JOIN_DELAY` | Seconds to wait before joining a huddle | `30` |
| `MAX_RECORDING_DURATION` | Max recording time in seconds | `14400` (4 hours) |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |

---

## Troubleshooting

**Bot doesn't join huddles**: Check that the Slack login session is valid — run `node scripts/login-slack.js` again.

**No audio captured**: Verify PulseAudio is running (`pactl info`) and the virtual sink exists (`pactl list sinks`).

**Gemini errors**: Check your API key and verify you have access to `gemini-3.1-flash-lite-preview` at [aistudio.google.com](https://aistudio.google.com).

**Bot crashes on startup**: Ensure all environment variables are set — the bot will tell you which one is missing.
# ganesha
