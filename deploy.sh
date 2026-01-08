#!/bin/bash
# Deployment script for Twitch Clips Local Player
# Run as root: sudo bash deploy.sh

set -e

# Configuration
DEPLOY_DIR="/var/www/html/twitch-clips-player"
SERVICE_NAME="twitch-clips"
NGINX_CONF="/etc/nginx/sites-enabled/default"

echo "=========================================="
echo "Twitch Clips Local Player - Deployment"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash deploy.sh"
    exit 1
fi

# Check for required tools
echo "[1/7] Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install with: apt install nodejs"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required. Install with: apt install npm"; exit 1; }
command -v yt-dlp >/dev/null 2>&1 || { echo "yt-dlp is required. Install with: pip install yt-dlp"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Node.js 18+ required. Current: $(node -v)"
    exit 1
fi
echo "    Node.js $(node -v) - OK"
echo "    yt-dlp $(yt-dlp --version) - OK"

# Create deployment directory
echo "[2/7] Creating deployment directory..."
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/downloaded_clips"

# Copy files
echo "[3/7] Copying application files..."
cp -r server.js package.json index.html "$DEPLOY_DIR/"

# Set ownership
chown -R www-data:www-data "$DEPLOY_DIR"
chmod 755 "$DEPLOY_DIR"
chmod 755 "$DEPLOY_DIR/downloaded_clips"

# Install dependencies
echo "[4/7] Installing Node.js dependencies..."
cd "$DEPLOY_DIR"
sudo -u www-data npm install --production

# Install systemd service
echo "[5/7] Installing systemd service..."
cp "$(dirname "$0")/systemd/twitch-clip.service" /etc/systemd/system/${SERVICE_NAME}.service
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

# Check service status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "    Service started successfully!"
else
    echo "    WARNING: Service may not have started. Check: journalctl -u ${SERVICE_NAME}"
fi

# Nginx configuration reminder
echo "[6/7] Nginx configuration..."
echo ""
echo "    Add the following to your nginx server block in $NGINX_CONF"
echo "    BEFORE the 'location / {' block:"
echo ""
echo "    ------- COPY BELOW THIS LINE -------"
cat "$(dirname "$0")/nginx/clips-subdirectory.conf"
echo ""
echo "    ------- COPY ABOVE THIS LINE -------"
echo ""

# Test nginx config
echo "[7/7] After adding nginx config, run:"
echo "    sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Your player will be available at:"
echo "  https://racer.netandvet.com/clips/?username=STREAMER&clientId=YOUR_ID&clientSecret=YOUR_SECRET"
echo ""
echo "Backend API endpoint:"
echo "  https://racer.netandvet.com/clips/api/health"
echo ""
echo "Useful commands:"
echo "  View logs:    journalctl -u ${SERVICE_NAME} -f"
echo "  Restart:      systemctl restart ${SERVICE_NAME}"
echo "  Stop:         systemctl stop ${SERVICE_NAME}"
echo "  Cleanup old:  curl -X POST http://localhost:3001/cleanup"
echo ""
