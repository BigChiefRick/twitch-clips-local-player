# Performance Analysis Report

**Date:** 2026-01-08
**Codebase:** Twitch Clips Local Player

---

## Executive Summary

This analysis identifies **15 performance issues** across the backend (server.js), frontend (index.html), and nginx configuration. The most critical issues are **synchronous file system operations blocking the event loop** and **sequential clip downloads (N+1 pattern)**.

---

## Critical Issues (High Impact)

### 1. Synchronous File System Operations Block Event Loop

**Location:** `server.js:24-26, 120, 125, 164, 170, 175, 230`

**Problem:** Multiple synchronous `fs` operations (`existsSync`, `mkdirSync`, `readdirSync`, `statSync`, `unlinkSync`) block Node.js's single-threaded event loop, preventing the server from handling other requests during I/O.

```javascript
// server.js:120-125 - getExistingClips()
const files = fs.readdirSync(CLIPS_DIR);  // BLOCKS
const mp4Files = files.filter(f => f.endsWith('.mp4'));

return mp4Files.map(file => {
    const stats = fs.statSync(filePath);  // BLOCKS - called for EACH file
    // ...
});
```

**Impact:** With 20 clips, this executes 21 synchronous I/O calls (1 readdir + 20 stat). On slow storage, this can block for 100-500ms per request.

**Recommendation:** Use async versions (`fs.promises.readdir`, `fs.promises.stat`) with `Promise.all()`.

---

### 2. Sequential Clip Downloads (N+1 Anti-Pattern)

**Location:** `server.js:72-99`

**Problem:** Clips are downloaded sequentially using `await` inside a for-loop. Each download must complete before the next begins.

```javascript
// server.js:72-99
for (const clip of clips) {
    // ...
    const downloadResult = await downloadClipLocally(clip, req);  // SEQUENTIAL
    // ...
}
```

**Impact:** Downloading 10 clips at ~5 seconds each = 50 seconds total. With parallel downloads (concurrency of 3), this could be ~17 seconds.

**Recommendation:** Use `p-limit` or `Promise.all()` with chunking for parallel downloads:

```javascript
const pLimit = require('p-limit');
const limit = pLimit(3); // 3 concurrent downloads

const downloadPromises = clips.map(clip =>
    limit(() => downloadClipLocally(clip, req))
);
await Promise.all(downloadPromises);
```

---

### 3. O(n*m) Clip Lookup Algorithm

**Location:** `server.js:74`

**Problem:** For each new clip, `existingClips.some()` iterates through all existing clips to check for duplicates.

```javascript
// server.js:74
if (existingClips.some(existing => existing.id === clip.id)) {
```

**Impact:** With 20 existing clips and 15 new clips to check, this performs up to 300 comparisons. Grows quadratically.

**Recommendation:** Use a `Set` for O(1) lookups:

```javascript
const existingIds = new Set(existingClips.map(c => c.id));
// ...
if (existingIds.has(clip.id)) {
```

---

### 4. OAuth Token Not Cached

**Location:** `server.js:258-264`

**Problem:** Every call to `getPopularClips()` requests a new OAuth token from Twitch, even though tokens are valid for ~60 days.

```javascript
// server.js:258-264
const tokenResponse = await fetch(
    `https://id.twitch.tv/oauth2/token?...`,
    { method: 'POST' }
);
```

**Impact:**
- Unnecessary network round-trip (~100-300ms) on every API request
- Risk of hitting Twitch rate limits
- Slower response times

**Recommendation:** Cache the token with expiration:

```javascript
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken(clientId, clientSecret) {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }
    const response = await fetch(...);
    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer
    return cachedToken;
}
```

---

## Medium Impact Issues

### 5. Missing Null Checks on API Responses

**Location:** `server.js:277, 306`

**Problem:** No validation that Twitch API returned expected data structure.

```javascript
// server.js:277
const broadcasterId = userData.data[0].id;  // Crashes if user not found
```

**Impact:** Server crashes with `TypeError: Cannot read property 'id' of undefined` for invalid usernames.

**Recommendation:** Add defensive checks:

```javascript
if (!userData.data || userData.data.length === 0) {
    throw new Error(`User '${username}' not found on Twitch`);
}
```

---

### 6. Redundant getExistingClips() Calls

**Location:** `server.js:48, 70`

**Problem:** `getExistingClips()` is called at line 48, then the result is copied and potentially modified. The function performs expensive I/O each time.

**Impact:** Double the file system operations when clips are being downloaded.

**Recommendation:** Call once and reuse the result.

---

### 7. No Timeout on External API Calls

**Location:** `server.js:258, 266, 297`

**Problem:** `fetch()` calls to Twitch API have no timeout configured.

**Impact:** If Twitch API is slow or unresponsive, requests hang indefinitely, consuming server resources.

**Recommendation:** Use `AbortController` with timeout:

```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

const response = await fetch(url, { signal: controller.signal });
clearTimeout(timeout);
```

---

### 8. URLSearchParams Created 6 Times

**Location:** `index.html:27-32`

**Problem:** Each config property creates a new `URLSearchParams` instance.

```javascript
// index.html:27-32
this.config = {
    username: new URLSearchParams(location.search).get('username'),
    clientId: new URLSearchParams(location.search).get('clientId'),
    clientSecret: new URLSearchParams(location.search).get('clientSecret'),
    // ... 3 more
};
```

**Impact:** Minor - parses URL 6 times instead of once. ~microseconds difference but indicates poor code hygiene.

**Recommendation:**

```javascript
const params = new URLSearchParams(location.search);
this.config = {
    username: params.get('username') || 'ticklefitz',
    clientId: params.get('clientId') || 'YOURCLIENTID',
    // ...
};
```

---

### 9. innerHTML Usage Instead of textContent

**Location:** `index.html:161-165`

**Problem:** Using `innerHTML` for clip info display.

```javascript
// index.html:161-165
this.clipInfo.innerHTML = `
    <strong>${clip.title}</strong><br>
    by ${clip.creator} • ${clip.duration}s<br>
    <small>Clip ${this.currentIndex + 1}/${this.clips.length}</small>
`;
```

**Impact:**
- **Security:** XSS vulnerability if clip.title/creator contains malicious HTML
- **Performance:** innerHTML triggers HTML parser; textContent is faster for plain text

**Recommendation:** Use textContent or sanitize input, or use DOM manipulation for structured content.

---

## Low Impact Issues

### 10. Redundant CORS Middleware

**Location:** `server.js:16-21`

**Problem:** Custom CORS headers are added for `/clips` static files, but the global `cors()` middleware at line 12 already handles this.

**Impact:** Unnecessary code; potential for inconsistent behavior.

---

### 11. File Search After Download

**Location:** `server.js:230-231`

**Problem:** After downloading, the code reads the entire directory to find the new file.

```javascript
// server.js:230-231
const files = fs.readdirSync(CLIPS_DIR);
const downloadedFile = files.find(f => f.startsWith(`${clip.id}-`));
```

**Impact:** Unnecessary I/O when the filename is already known from the output template.

---

### 12. No Video Memory Cleanup

**Location:** `index.html:177-178`

**Problem:** When switching clips, old video sources are not explicitly released.

**Impact:** Minor memory buildup in long-running sessions. Modern browsers handle this, but explicit cleanup is better practice:

```javascript
URL.revokeObjectURL(this.source.src); // If using blob URLs
this.video.removeAttribute('src');
this.video.load();
```

---

### 13. Status Element Frequent Updates

**Location:** `index.html:70, 74, 81, 125, 133, 172`

**Problem:** The status DOM element is updated many times during clip loading/playing.

**Impact:** Minor - causes repaints. Negligible on modern browsers but adds noise.

---

## Nginx Configuration Issues

### 14. Missing CORS Headers on Video Files

**Location:** `nginx/site.conf:36-38`

**Problem:** The nested location block for video files doesn't inherit or re-add CORS headers.

```nginx
location ~* \.(mp4|webm|ogg)$ {
    add_header Accept-Ranges bytes;
    # CORS headers from parent block are NOT inherited!
}
```

**Impact:** Video files may fail to load in browser due to CORS errors.

**Recommendation:** Explicitly add CORS headers or restructure:

```nginx
location ~* \.(mp4|webm|ogg)$ {
    add_header Accept-Ranges bytes;
    add_header Access-Control-Allow-Origin *;
}
```

---

### 15. X-Frame-Options DENY Conflicts with OBS

**Location:** `nginx/site.conf:33`

**Problem:** `X-Frame-Options DENY` prevents the page from being embedded in iframes.

```nginx
add_header X-Frame-Options DENY;
```

**Impact:** OBS Browser Source and other embedding tools cannot use the player.

**Recommendation:** Use `SAMEORIGIN` or remove entirely for this use case:

```nginx
add_header X-Frame-Options SAMEORIGIN;
```

---

## Summary Table

| # | Issue | Severity | File | Line(s) |
|---|-------|----------|------|---------|
| 1 | Sync file operations block event loop | **Critical** | server.js | 24-26, 120, 125, 164, 170, 175 |
| 2 | Sequential downloads (N+1) | **Critical** | server.js | 72-99 |
| 3 | O(n*m) clip lookup | **High** | server.js | 74 |
| 4 | OAuth token not cached | **High** | server.js | 258-264 |
| 5 | Missing null checks on API | Medium | server.js | 277, 306 |
| 6 | Redundant getExistingClips() | Medium | server.js | 48, 70 |
| 7 | No API timeout | Medium | server.js | 258, 266, 297 |
| 8 | URLSearchParams created 6x | Low | index.html | 27-32 |
| 9 | innerHTML XSS risk | Medium | index.html | 161-165 |
| 10 | Redundant CORS middleware | Low | server.js | 16-21 |
| 11 | File search after download | Low | server.js | 230-231 |
| 12 | No video memory cleanup | Low | index.html | N/A |
| 13 | Frequent status updates | Low | index.html | multiple |
| 14 | Missing CORS on video files | Medium | nginx/site.conf | 36-38 |
| 15 | X-Frame-Options blocks OBS | Medium | nginx/site.conf | 33 |

---

## Recommended Priority Order

1. **Convert sync fs operations to async** - Prevents event loop blocking
2. **Implement parallel downloads** - Major speed improvement
3. **Cache OAuth tokens** - Faster API responses, fewer rate limit risks
4. **Add Set-based clip lookup** - Faster duplicate detection
5. **Add API response validation** - Prevents crashes
6. **Fix nginx CORS/framing issues** - Functional correctness

---

## Estimated Impact

Implementing the critical fixes (1-4) could improve:
- **API response time:** 50-70% faster for cached requests
- **Download time:** 60-70% faster for fresh clip fetches
- **Server throughput:** 3-5x more concurrent requests supported
