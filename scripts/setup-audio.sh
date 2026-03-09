#!/bin/bash
# ============================================================
# Server Setup Script for Huddle Minutes Bot
# Run this on your AWS EC2 Instance (Ubuntu or Amazon Linux)
# ============================================================

set -e

echo "🔧 Setting up Huddle Minutes Bot server..."

# Detect OS and set package manager
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  echo "❌ Could not detect OS."
  exit 1
fi

echo "📦 Updating system packages and installing dependencies..."
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y xvfb pulseaudio ffmpeg curl git
elif [[ "$OS" == "amzn" || "$OS" == "centos" || "$OS" == "rhel" ]]; then
  sudo yum update -y
  
  # For Amazon Linux 2023, some packages from EPEL/CodeReady might be needed, but these are standard
  sudo yum install -y Xvfb pulseaudio ffmpeg curl git
else
  echo "❌ Unsupported OS: $OS. Please use Ubuntu or Amazon Linux."
  exit 1
fi

# Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js 20..."
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
  elif [[ "$OS" == "amzn" || "$OS" == "centos" || "$OS" == "rhel" ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  fi
fi
echo "✅ Node.js $(node --version)"

# Install PM2 (process manager)
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing PM2..."
  sudo npm install -g pm2
fi

# Install Playwright browsers
echo "📦 Installing Playwright Chromium..."
npx playwright install chromium
npx playwright install-deps chromium

# Setup PulseAudio virtual sink
echo "🔊 Configuring PulseAudio virtual audio sink..."

# Create PulseAudio config for virtual sink
mkdir -p ~/.config/pulse
cat > ~/.config/pulse/default.pa << 'EOF'
# Load default modules
.include /etc/pulse/default.pa

# Create virtual speaker sink (browser audio goes here)
load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description="Virtual_Speaker"

# Set it as default
set-default-sink virtual_speaker
EOF

# Create systemd service for Xvfb
echo "🖥️ Setting up Xvfb virtual display..."
sudo tee /etc/systemd/system/xvfb.service > /dev/null << 'EOF'
[Unit]
Description=X Virtual Frame Buffer
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1280x720x24
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF

# Replace $USER placeholder
sudo sed -i "s/\$USER/$USER/g" /etc/systemd/system/xvfb.service

# Create systemd service for PulseAudio
echo "🔊 Setting up PulseAudio service..."
sudo tee /etc/systemd/system/pulseaudio-bot.service > /dev/null << 'EOF'
[Unit]
Description=PulseAudio for Huddle Bot
After=xvfb.service

[Service]
Type=simple
Environment=DISPLAY=:99
ExecStart=/usr/bin/pulseaudio --daemonize=no --exit-idle-time=-1
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo sed -i "s/\$USER/$USER/g" /etc/systemd/system/pulseaudio-bot.service

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable xvfb.service
sudo systemctl start xvfb.service
sudo systemctl enable pulseaudio-bot.service
sudo systemctl start pulseaudio-bot.service

# Set DISPLAY env
echo 'export DISPLAY=:99' >> ~/.bashrc

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in your tokens"
echo "  2. Run: npm install"
echo "  3. Run: node scripts/login-slack.js  (one-time Slack login)"
echo "  4. Run: pm2 start src/app.js --name huddle-bot"
echo ""
