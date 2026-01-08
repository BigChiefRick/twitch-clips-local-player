# Subdirectory Deployment Guide

Deploy the Twitch Clips Player at `/clips/` on an existing website (e.g., `racer.netandvet.com/clips/`).

## Quick Deploy (5 minutes)

### 1. Clone and Deploy

```bash
# On your server
cd /var/www/html
git clone https://github.com/BigChiefRick/twitch-clips-local-player.git twitch-clips-player
cd twitch-clips-player

# Run deployment script
sudo bash deploy.sh
```

### 2. Add Nginx Configuration

Edit your existing nginx config:

```bash
sudo nano /etc/nginx/sites-enabled/default
```

Add this **BEFORE** the `location / {` block in your server section:

```nginx
# ============================================
# TWITCH CLIPS PLAYER (/clips/)
# ============================================

# Serve the player frontend at /clips/
location = /clips {
    return 301 /clips/;
}

location = /clips/ {
    alias /var/www/html/twitch-clips-player/;
    try_files /index.html =404;
}

# API proxy to Node.js backend
location /clips/api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}

# Serve downloaded video clips
location /clips/videos/ {
    alias /var/www/html/twitch-clips-player/downloaded_clips/;

    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods 'GET, OPTIONS' always;
    add_header Access-Control-Allow-Headers 'Range, Content-Type' always;
    add_header Cache-Control "public, max-age=3600";
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;

    location ~* \.(mp4|webm|ogg)$ {
        add_header Accept-Ranges bytes always;
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Range, Content-Type' always;
        add_header Cache-Control "public, max-age=3600";
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
    }
}
```

### 3. Apply Nginx Config

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Verify

```bash
# Test API
curl https://racer.netandvet.com/clips/api/health

# Open in browser
# https://racer.netandvet.com/clips/?username=STREAMER&clientId=YOUR_ID&clientSecret=YOUR_SECRET
```

## URL Structure

| Path | Purpose |
|------|---------|
| `/clips/` | Player frontend (index.html) |
| `/clips/api/` | Backend API |
| `/clips/api/health` | Health check |
| `/clips/api/popular-clips/:username` | Get clips for user |
| `/clips/videos/` | Downloaded video files |

## Usage in OBS

Add a **Browser Source** with:
- **URL:** `https://racer.netandvet.com/clips/?username=ticklefitz&clientId=YOUR_ID&clientSecret=YOUR_SECRET`
- **Width:** 1920
- **Height:** 1080
- **Check:** "Control audio via OBS"

## Troubleshooting

```bash
# Check service status
sudo systemctl status twitch-clips

# View logs
sudo journalctl -u twitch-clips -f

# Test backend directly
curl http://localhost:3001/health

# Check nginx errors
sudo tail -f /var/log/nginx/error.log
```

## File Locations

| File | Path |
|------|------|
| Application | `/var/www/html/twitch-clips-player/` |
| Downloaded clips | `/var/www/html/twitch-clips-player/downloaded_clips/` |
| Systemd service | `/etc/systemd/system/twitch-clips.service` |
| Nginx config | `/etc/nginx/sites-enabled/default` |
