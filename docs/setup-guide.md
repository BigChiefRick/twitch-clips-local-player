# Complete Setup Guide

## 🎯 Overview

This guide will walk you through setting up the Twitch Clips Local Player from scratch on a Linux server (Ubuntu/Debian).

## 📋 Prerequisites

- Linux server (Ubuntu 20.04+ or Debian 11+)
- Root or sudo access
- Domain name with SSL certificate (recommended)
- Twitch Developer Account

## 🔧 Step-by-Step Installation

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git nginx python3 python3-pip

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installations
node --version    # Should be 18+
npm --version
python3 --version
```

### 2. Install yt-dlp

```bash
# Install yt-dlp
pip3 install yt-dlp

# Verify installation
yt-dlp --version

# Make sure it's in PATH
which yt-dlp
```

### 3. Download and Setup Application

```bash
# Navigate to web directory
cd /var/www/html

# Clone repository
git clone https://github.com/yourusername/twitch-clips-local-player.git twitch-clips-backend
cd twitch-clips-backend

# Install Node.js dependencies
npm install

# Create clips directory
mkdir -p downloaded_clips

# Set proper permissions
sudo chown -R www-data:www-data /var/www/html/twitch-clips-backend
sudo chmod -R 755 /var/www/html/twitch-clips-backend
sudo chmod 755 downloaded_clips
```

### 4. Create Twitch Application

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Click "Register Your Application"
3. Fill out the form:
   - **Name:** Your App Name
   - **OAuth Redirect URLs:** `https://yourdomain.com`
   - **Category:** Website Integration
4. Save your **Client ID** and **Client Secret**

### 5. Configure Systemd Service

```bash
# Copy service file
sudo cp systemd/twitch-clips.service /etc/systemd/system/

# Edit if needed (check paths)
sudo nano /etc/systemd/system/twitch-clips.service

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable twitch-clips
sudo systemctl start twitch-clips

# Check status
sudo systemctl status twitch-clips
```

### 6. Configure Nginx

```bash
# Edit your nginx site configuration
sudo nano /etc/nginx/sites-available/default

# Add the location blocks from nginx/site.conf
# Make sure to add them inside your existing server block

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 7. Test Installation

```bash
# Test backend health
curl http://localhost:3001/health

# Test through nginx
curl https://yourdomain.com/api/health

# Test clip endpoint (replace with your credentials)
curl "https://yourdomain.com/api/popular-clips/shroud?clientId=YOUR_ID&clientSecret=YOUR_SECRET&limit=1"
```

## 🌐 Frontend Setup

### Option 1: Place in Web Root

```bash
# Copy frontend to web root
cp index.html /var/www/html/

# Set permissions
sudo chown www-data:www-data /var/www/html/index.html
```

### Option 2: Separate Directory

```bash
# Create clips directory
sudo mkdir -p /var/www/html/clips
cp index.html /var/www/html/clips/
sudo chown -R www-data:www-data /var/www/html/clips
```

## 🔒 SSL/HTTPS Setup (Optional but Recommended)

### Using Certbot (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

## 🧪 Testing Your Setup

### 1. Basic Test

```bash
# Open in browser
https://yourdomain.com/index.html?username=shroud&clientId=YOUR_ID&clientSecret=YOUR_SECRET
```

### 2. OBS Test

1. Add **Browser Source** in OBS
2. **URL:** `https://yourdomain.com/index.html?username=shroud&clientId=YOUR_ID&clientSecret=YOUR_SECRET`
3. **Width:** 1920, **Height:** 1080
4. Check **"Control audio via OBS"**

### 3. Debug Mode

```bash
# Add debug parameter
https://yourdomain.com/index.html?username=shroud&clientId=YOUR_ID&clientSecret=YOUR_SECRET&debug=true
```

## 🔧 Configuration Options

### Environment Variables

Edit the systemd service file to add environment variables:

```ini
[Service]
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=CLIPS_DIR=/var/www/html/twitch-clips-backend/downloaded_clips
Environment=CACHE_DURATION=48
```

### Log Monitoring

```bash
# Watch logs in real-time
sudo journalctl -u twitch-clips -f

# View recent logs
sudo journalctl -u twitch-clips --since "10 minutes ago"
```

## 🚨 Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u twitch-clips --no-pager

# Common issues:
# 1. Wrong file paths in service file
# 2. Permission issues
# 3. Missing dependencies
```

### No Audio in OBS

1. Ensure **"Control audio via OBS"** is checked
2. Check OBS Audio Mixer - source shouldn't be muted
3. Test direct file URL: `https://yourdomain.com/clips/filename.mp4`

### Downloads Failing

```bash
# Test yt-dlp manually
yt-dlp --format 'best[ext=mp4][acodec!=none]/best[acodec!=none]/best' "https://clips.twitch.tv/CLIP_ID"

# Check permissions
ls -la /var/www/html/twitch-clips-backend/downloaded_clips/
```

### 404 Errors

1. Check nginx configuration
2. Verify file permissions
3. Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

## 🔄 Maintenance

### Regular Cleanup

```bash
# Clean old clips (automated via cron)
echo "0 2 * * * curl -X POST http://localhost:3001/cleanup" | sudo crontab -
```

### Updates

```bash
cd /var/www/html/twitch-clips-backend
git pull origin main
npm install
sudo systemctl restart twitch-clips
```

### Monitoring

```bash
# Check disk usage
df -h /var/www/html/twitch-clips-backend/downloaded_clips/

# Check service status
sudo systemctl status twitch-clips

# Check active connections
sudo netstat -tlnp | grep :3001
```

## 📞 Support

- Check the [Troubleshooting Guide](troubleshooting.md)
- Review logs: `sudo journalctl -u twitch-clips -f`
- Open an issue on GitHub with logs and error messages

---

**Next:** [Troubleshooting Guide](troubleshooting.md)