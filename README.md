# YouTube Downloader

A simple web app for downloading YouTube videos. You paste a URL, pick a quality, and it downloads to your computer.

**⚠️ Legal heads-up:** YouTube's Terms of Service don't allow downloading their videos. This app is for personal use only — education, testing your own uploads, that kind of thing. Don't use it to download copyrighted content you don't have permission to download. Respect creators and follow copyright law.

## What You Need

- **Node.js** (includes npm) — download from https://nodejs.org/
- **yt-dlp** — the actual tool that does the downloading. Install it:
  ```cmd
  winget install yt-dlp.yt-dlp
  ```
  Or download from: https://github.com/yt-dlp/yt-dlp/releases
- **ffmpeg** — needed to merge video and audio streams for HD formats. Install it:
  ```cmd
  winget install yt-dlp.FFmpeg
  ```
  The app auto-detects ffmpeg even if it's not on your PATH.

## Getting Started

### 1. Install Dependencies

```cmd
cd youtube-downloader\backend
npm install

cd ..\frontend
npm install
```

### 2. Set Up Environment (Backend)

In `backend/`, copy `.env.example` to `.env`:

```cmd
cd backend
copy .env.example .env
```

If yt-dlp isn't on your PATH, open `.env` and set the full path:
```
YTDLP_PATH=C:\Users\YourUsername\AppData\Local\Microsoft\WinGet\Links\yt-dlp.exe
```

### 3. Start Both Servers

**Terminal 1 — Backend:**
```cmd
cd youtube-downloader\backend
npm start
```

Should print: `Backend running at http://localhost:5000`

**Terminal 2 — Frontend:**
```cmd
cd youtube-downloader\frontend
npm run dev
```

Should print: `VITE v5.x.x  ready in XXX ms` and a URL like `http://localhost:5173`

### 4. Open in Your Browser

Go to `http://localhost:5173` and paste a YouTube URL.

## How It Works

**Architecture:**
- **Frontend** (React + Vite) — The UI you interact with
- **Backend** (Express) — Runs yt-dlp, manages downloads, streams files back to you

**What happens when you download:**
1. Frontend sends the YouTube URL and your chosen quality to the backend
2. Backend runs yt-dlp, which downloads the video stream(s) from YouTube
3. If it's an HD format (separate video and audio), ffmpeg merges them into a single MP4
4. Backend streams the finished file back to your browser
5. Your browser's download dialog pops up, saves the file to your Downloads folder
6. Backend cleans up temporary files

**Why download to disk instead of stdout?**
When ffmpeg merges video and audio, it needs to write an MP4 index (the "moov atom") that goes at the start of the file. This requires seeking backwards, which doesn't work on a pipe. So we download to a temp folder on disk, then stream it back to the browser. It's a bit roundabout, but it's the only way to get a playable file.

## Troubleshooting

### "Backend unreachable"
Make sure the backend is running (`npm start` in the `backend/` folder). It should be on `http://localhost:5000`.

### "yt-dlp is not installed or not on PATH"
Install yt-dlp:
```cmd
winget install yt-dlp.yt-dlp
```

Or set `YTDLP_PATH` in `backend/.env` to the full path if it's installed in an unusual location.

### "ffmpeg not found"
The app needs ffmpeg to merge HD video and audio. Install it:
```cmd
winget install yt-dlp.FFmpeg
```

The app auto-scans the WinGet packages folder, so you don't need to add it to PATH.

### Video downloads but won't play
Make sure ffmpeg was actually installed. Try opening the file with VLC (which is more lenient than Windows Media Player) to see if it plays. If VLC can't play it either, something went wrong with the download.

### Video is corrupted / jumps to the end
This usually means ffmpeg didn't merge the streams correctly. Check that:
1. ffmpeg is installed (`winget install yt-dlp.FFmpeg`)
2. The backend restarted after you installed ffmpeg
3. Try downloading a lower-quality format (480p or 720p instead of 1080p)

### Want to access it from another device on your network?
Instead of `localhost`, use your computer's IP address. Find your IP:
```cmd
ipconfig
```

Look for "IPv4 Address" (something like `192.168.1.100`). Then on another device, visit `http://192.168.1.100:5173`.

**Note:** This only works on the same WiFi network. It's not accessible from the internet.

## Hosting on the Cloud

You *can* deploy this to AWS, Heroku, or DigitalOcean, but be aware:
- YouTube actively blocks and shuts down hosted downloaders
- Most hosting providers have Terms of Service that forbid this
- Your account will likely get disabled if you try
- Bandwidth costs add up fast

**The practical advice:** Keep it local. It's free, fast, and you control everything.

## Project Structure

```
youtube-downloader/
├── backend/
│   ├── server.js               # Express app setup, CORS, routing
│   ├── controllers/
│   │   └── downloadController.js # Handlers for /api/video/info and /download
│   ├── routes/
│   │   └── download.js          # Route definitions
│   ├── utils/
│   │   └── ytDlpHelper.js       # yt-dlp spawning, format parsing, ffmpeg detection
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx              # Main app state and logic
    │   ├── App.css              # Styling (dark theme)
    │   └── components/
    │       ├── VideoInput.jsx    # URL input + clipboard button
    │       ├── MetadataDisplay.jsx # Shows video title, channel, thumbnail
    │       ├── FormatSelector.jsx  # Quality/format picker
    │       └── DownloadProgress.jsx # Progress bar + speed/ETA
    ├── vite.config.js           # Vite config (proxies /api to backend)
    └── package.json
```

## Development Notes

- The backend runs yt-dlp via `child_process.spawn`, never `exec`, so arguments can't be shell-injected
- Downloads are streamed directly from yt-dlp to a temp file to the browser — no large temp files left on disk
- Rate limiting (30 requests per 5 minutes per IP) prevents abuse
- The frontend validates YouTube URLs with regex before sending to the backend
- Error messages from the backend are passed through to the user

## FAQ

**Q: Will this work on macOS / Linux?**
Probably, with minor tweaks. The ffmpeg detection logic is Windows-specific (WinGet), so you'd need to adjust `findFfmpegDir()` in `utils/ytDlpHelper.js`.

**Q: Can I batch download multiple videos?**
Not yet. One URL at a time right now.

**Q: Can I download subtitles?**
Not in this version. Would be straightforward to add — yt-dlp supports it with `--write-subs`.

**Q: What formats does it support?**
Whatever yt-dlp and ffmpeg support. Usually MP4 (H264 + AAC) for video, and M4A, MP3 for audio-only.

**Q: How big are the files?**
Depends on quality and duration. A typical 10-minute 1080p video is 50–150 MB. 4K is bigger, lower quality is smaller.

---

Made with React, Express, and yt-dlp.
