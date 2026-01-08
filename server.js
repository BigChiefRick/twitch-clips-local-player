// server.js - Final working version with caching and audio
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIPS_DIR = path.join(__dirname, 'downloaded_clips');
// Base path for video URLs - configure based on your nginx setup
const VIDEO_URL_PATH = process.env.VIDEO_URL_PATH || '/clips/videos';

app.use(cors());
app.use(express.json());

// Serve downloaded clips as static files
app.use('/clips', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}, express.static(CLIPS_DIR));

// Create clips directory if it doesn't exist
if (!fs.existsSync(CLIPS_DIR)) {
    fs.mkdirSync(CLIPS_DIR, { recursive: true });
    console.log(`Created clips directory: ${CLIPS_DIR}`);
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Cached Twitch Clips Player',
        clipsDir: CLIPS_DIR
    });
});

// Smart clips endpoint - uses cache first
app.get('/popular-clips/:username', async (req, res) => {
    const { username } = req.params;
    const { clientId, clientSecret, limit = 15, period = 'week', forceRefresh = 'false' } = req.query;

    if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'clientId and clientSecret required' });
    }

    try {
        // Check existing files first
        const existingClips = getExistingClips(req);
        console.log(`Found ${existingClips.length} existing clips in cache`);

        // If we have enough clips and not forcing refresh, use cache
        if (existingClips.length >= 10 && forceRefresh !== 'true') {
            console.log(`✅ Using ${existingClips.length} cached clips`);
            return res.json({
                success: true,
                username,
                total: existingClips.length,
                downloaded: existingClips.length,
                clips: existingClips.slice(0, 20), // Return up to 20 cached clips
                cached: true
            });
        }

        // Need more clips - fetch from Twitch
        console.log(`Need more clips. Getting fresh ones for ${username}...`);
        const clips = await getPopularClips(username, limit, period, clientId, clientSecret);
        console.log(`Found ${clips.length} clips from Twitch API`);
        
        // Download only new clips (ones we don't already have)
        const downloadedClips = [...existingClips]; // Start with existing
        
        for (const clip of clips) {
            // Skip if we already have this clip
            if (existingClips.some(existing => existing.id === clip.id)) {
                console.log(`⏭️  Skipping existing: ${clip.title}`);
                continue;
            }
            
            // Stop if we have enough
            if (downloadedClips.length >= 20) {
                console.log(`✋ Have enough clips (${downloadedClips.length}), stopping downloads`);
                break;
            }
            
            try {
                const downloadResult = await downloadClipLocally(clip, req);
                if (downloadResult && downloadResult.success) {
                    downloadedClips.push({
                        ...clip,
                        localFile: downloadResult.filename,
                        localUrl: `${VIDEO_URL_PATH}/${encodeURIComponent(downloadResult.filename)}`,
                        duration: clip.duration // Make sure duration is included
                    });
                    console.log(`✅ Downloaded: ${clip.title} (${clip.duration}s)`);
                }
            } catch (error) {
                console.error(`❌ Failed to download ${clip.title}:`, error.message);
            }
        }

        console.log(`Final result: ${downloadedClips.length} total clips available`);
        
        res.json({
            success: true,
            username,
            total: downloadedClips.length,
            downloaded: downloadedClips.length,
            clips: downloadedClips,
            cached: false
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get existing clips from directory
function getExistingClips(req) {
    try {
        const files = fs.readdirSync(CLIPS_DIR);
        const mp4Files = files.filter(f => f.endsWith('.mp4'));
        
        return mp4Files.map(file => {
            const filePath = path.join(CLIPS_DIR, file);
            const stats = fs.statSync(filePath);
            
            // Extract clip ID from filename
            const clipId = file.split('-')[0];
            
            // Extract title from filename (remove ID and extension)
            const titlePart = file.replace(`${clipId}-`, '').replace('.mp4', '').replace(/_/g, ' ');
            
            return {
                id: clipId,
                title: titlePart,
                creator: 'Cached',
                duration: 30, // Default duration for cached clips
                views: 0,
                localFile: file,
                localUrl: `${VIDEO_URL_PATH}/${encodeURIComponent(file)}`,
                created: stats.birthtime.toISOString(),
                cached: true
            };
        }).sort((a, b) => new Date(b.created) - new Date(a.created)); // Newest first
    } catch (error) {
        console.error('Error reading existing clips:', error);
        return [];
    }
}

// List clips endpoint
app.get('/list-clips', (req, res) => {
    try {
        const clips = getExistingClips(req);
        res.json({ clips });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clean up old clips
app.post('/cleanup', (req, res) => {
    try {
        const files = fs.readdirSync(CLIPS_DIR);
        let deletedCount = 0;
        
        for (const file of files) {
            if (file.endsWith('.mp4')) {
                const filePath = path.join(CLIPS_DIR, file);
                const stats = fs.statSync(filePath);
                const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
                
                // Delete files older than 48 hours (increased from 24)
                if (ageHours > 48) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    console.log(`🗑️  Deleted old clip: ${file}`);
                }
            }
        }
        
        res.json({ success: true, deletedFiles: deletedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download clip locally using yt-dlp
function downloadClipLocally(clip, req) {
    return new Promise((resolve, reject) => {
        // Create safe filename
        const safeTitle = clip.title
            .replace(/[^a-zA-Z0-9\s\-_]/g, '')
            .replace(/\s+/g, ' ')
            .substring(0, 30)
            .trim()
            .replace(/\s/g, '_');
        
        const baseFilename = `${clip.id}-${safeTitle}`;
        const outputTemplate = path.join(CLIPS_DIR, `${baseFilename}.%(ext)s`);
        
        console.log(`⬇️  Downloading: ${clip.title}`);
        
        const ytDlpProcess = spawn('yt-dlp', [
            '--format', 'best[ext=mp4][acodec!=none]/best[acodec!=none]/best',
            '--output', outputTemplate,
            '--no-playlist',
            '--no-warnings',
            '--restrict-filenames',
            '--merge-output-format', 'mp4',
            '--embed-metadata',
            '--audio-quality', '0',
            clip.url
        ]);

        let output = '';
        let errorOutput = '';

        ytDlpProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytDlpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ytDlpProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const files = fs.readdirSync(CLIPS_DIR);
                    const downloadedFile = files.find(f => f.startsWith(`${clip.id}-`));
                    
                    if (downloadedFile) {
                        resolve({
                            success: true,
                            filename: downloadedFile
                        });
                    } else {
                        resolve({ success: false });
                    }
                } catch (error) {
                    resolve({ success: false });
                }
            } else {
                console.error(`❌ yt-dlp failed for ${clip.url}`);
                resolve({ success: false });
            }
        });

        ytDlpProcess.on('error', (error) => {
            resolve({ success: false });
        });
    });
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

// Get popular clips from Twitch API
async function getPopularClips(username, limit, period, clientId, clientSecret) {
    const tokenResponse = await fetchWithTimeout(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: 'POST' }
    );

    if (!tokenResponse.ok) {
        throw new Error(`Failed to get OAuth token: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
        throw new Error('OAuth response missing access_token');
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetchWithTimeout(
        `https://api.twitch.tv/helix/users?login=${username}`,
        {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
            }
        }
    );

    if (!userResponse.ok) {
        throw new Error(`Failed to get user info: ${userResponse.status} ${userResponse.statusText}`);
    }

    const userData = await userResponse.json();

    if (!userData.data || userData.data.length === 0) {
        throw new Error(`Twitch user '${username}' not found`);
    }

    const broadcasterId = userData.data[0].id;

    let startDate = new Date();
    switch(period) {
        case 'day':
            startDate.setDate(startDate.getDate() - 1);
            break;
        case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            break;
    }

    let query = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=${limit}`;
    if (period !== 'all') {
        query += `&started_at=${startDate.toISOString()}`;
    }

    const clipsResponse = await fetchWithTimeout(query, {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!clipsResponse.ok) {
        throw new Error(`Failed to get clips: ${clipsResponse.status} ${clipsResponse.statusText}`);
    }

    const clipsData = await clipsResponse.json();

    if (!clipsData.data) {
        return [];
    }

    return clipsData.data.map(clip => ({
        id: clip.id,
        title: clip.title,
        url: `https://clips.twitch.tv/${clip.id}`,
        creator: clip.creator_name,
        duration: clip.duration,
        views: clip.view_count,
        created: clip.created_at
    }));
}

app.listen(PORT, () => {
    console.log(`🚀 Cached Twitch Clips Player running on port ${PORT}`);
    console.log(`📁 Clips directory: ${CLIPS_DIR}`);
    console.log(`💾 Caching enabled - reuses existing clips`);
});