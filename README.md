# Twitch Clips Local Player

🎮 **Local Twitch clips player optimized for OBS and cloud streaming platforms**

Downloads Twitch clips locally and serves them as MP4 files, bypassing browser restrictions and providing smooth autoplay with audio for streaming applications.

## ✨ Features

- ✅ **Downloads clips locally** - No CORS, autoplay, or network issues
- ✅ **Full audio support** - Bypasses browser mute restrictions  
- ✅ **OBS/Golightstream ready** - Zero user interaction required
- ✅ **Smart caching** - Reuses existing clips, fast loading on repeat visits
- ✅ **Auto-advancing** - Seamless transitions between clips
- ✅ **HTTPS ready** - Works with SSL certificates
- ✅ **Configurable** - Easy URL parameters for different streamers

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Python 3 with pip
- Nginx (recommended)
- Twitch Developer Account

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/twitch-clips-local-player.git
cd twitch-clips-local-player
```

2. **Install dependencies:**
```bash
npm install
pip install yt-dlp
```

3. **Set up Twitch API credentials:**
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Create a new application
   - Note your Client ID and Client Secret

4. **Start the backend:**
```bash
node server.js
```

5. **Open the frontend:**
```
http://localhost:3001/index.html?username=STREAMER&clientId=YOUR_ID&clientSecret=YOUR_SECRET
```

## 🛠️ Production Setup

### Backend Service (systemd)

Create `/etc/systemd/system/twitch-clips.service`:
```ini
[Unit]
Description=Twitch Clips Backend
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/twitch-clips-backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable twitch-clips
sudo systemctl start twitch-clips
```

### Nginx Configuration

Add to your nginx config:
```nginx
# API proxy
location /api/ {
    proxy_pass http://localhost:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Serve downloaded clips
location /clips/ {
    alias /var/www/html/twitch-clips-backend/downloaded_clips/;
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "public, max-age=3600";
}
```

## 📖 Usage

### Basic URL Structure
```
https://yourdomain.com/index.html?username=STREAMER&clientId=YOUR_ID&clientSecret=YOUR_SECRET
```

### URL Parameters

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `username` | Twitch streamer name | Required | `username=shroud` |
| `clientId` | Twitch App Client ID | Required | `clientId=abc123...` |
| `clientSecret` | Twitch App Client Secret | Required | `clientSecret=def456...` |
| `backend` | Backend API URL | `https://yourdomain.com/api` | `backend=http://localhost:3001` |
| `period` | Time period for clips | `week` | `period=month` |
| `clipCount` | Number of clips to fetch | `15` | `clipCount=30` |
| `showInfo` | Show clip information | `true` | `showInfo=false` |

### OBS Browser Source Setup

1. **Add Browser Source** in OBS
2. **URL:** `https://yourdomain.com/index.html?username=STREAMER&clientId=ID&clientSecret=SECRET`
3. **Width:** 1920, **Height:** 1080
4. **✅ Control audio via OBS**
5. **✅ Shutdown source when not visible:** Unchecked
6. **✅ Refresh browser when scene becomes active**

### Example URLs

**Shroud clips:**
```
https://yourdomain.com/index.html?username=shroud&clientId=YOUR_ID&clientSecret=YOUR_SECRET
```

**Monthly clips with debug:**
```
https://yourdomain.com/index.html?username=ninja&period=month&clipCount=50&debug=true
```

## 🔧 API Endpoints

### GET `/health`
Health check endpoint

### GET `/popular-clips/:username`
Get and download popular clips for a streamer

**Query Parameters:**
- `clientId` - Twitch Client ID
- `clientSecret` - Twitch Client Secret  
- `limit` - Number of clips (default: 15)
- `period` - Time period: day/week/month/all (default: week)

### GET `/list-clips`
List all downloaded clips

### POST `/cleanup`
Clean up old clips (removes files older than 48 hours)

## 🎯 For Streaming Platforms

### OBS Studio
- Works perfectly with Browser Sources
- Audio automatically captured
- No user interaction required

### Golightstream  
- Fully compatible with cloud streaming
- No CORS or autoplay issues
- Reliable local file serving

### Streamlabs/XSplit
- Standard browser source compatibility
- Local MP4 files for stability

## 🐛 Troubleshooting

### No audio in browser
- **Solution:** Audio works automatically in OBS
- **For testing:** Add `&autoplay=allow` to URL

### Clips not downloading
- Check yt-dlp installation: `yt-dlp --version`
- Verify Twitch API credentials
- Check backend logs: `sudo journalctl -u twitch-clips -f`

### 404 errors on clips
- Ensure nginx `/clips/` location is configured
- Check file permissions: `sudo chmod 755 downloaded_clips/`
- Verify files exist: `ls -la downloaded_clips/`

### Slow loading
- **First visit:** Downloads clips (takes time)
- **Repeat visits:** Uses cache (instant loading)
- **Force refresh:** Add `&forceRefresh=true`

## 📁 File Structure

```
twitch-clips-local-player/
├── server.js              # Backend API server
├── index.html             # Frontend player
├── package.json           # Dependencies
├── README.md              # This file
├── systemd/
│   └── twitch-clips.service  # Systemd service file
├── nginx/
│   └── site.conf          # Nginx configuration
└── docs/
    ├── setup-guide.md     # Detailed setup guide
    └── troubleshooting.md # Common issues
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for video downloading
- [Twitch API](https://dev.twitch.tv/) for clip metadata
- Built for the streaming community

## 🔗 Links

- [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- [OBS Studio](https://obsproject.com/)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp#readme)

---

**Made with ❤️ for streamers and content creators**
