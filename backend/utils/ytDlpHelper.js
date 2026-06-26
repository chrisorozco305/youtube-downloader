const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

// Locate ffmpeg so yt-dlp can merge separate video+audio streams (needed for
// any HD format). We don't rely on PATH: prefer FFMPEG_LOCATION, otherwise scan
// the WinGet Packages dir where the yt-dlp.FFmpeg / Gyan.FFmpeg builds land.
//
// Why this matters: YouTube serves HD formats as separate video-only and audio-only
// streams (VP9/H264 video + Opus/AAC audio). Without ffmpeg, yt-dlp can't merge them
// into a single playable file. A raw VP9 stream won't play on Windows Media Player.
//
// Returns the directory containing ffmpeg.exe, or null if not found.
const findFfmpegDir = (() => {
  let cached;
  return () => {
    if (cached !== undefined) return cached;

    if (process.env.FFMPEG_LOCATION) {
      cached = process.env.FFMPEG_LOCATION;
      return cached;
    }

    const candidates = [];
    const wingetPkgs = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft', 'WinGet', 'Packages'
    );
    try {
      for (const pkg of fs.readdirSync(wingetPkgs)) {
        if (!/ffmpeg/i.test(pkg)) continue;
        const pkgDir = path.join(wingetPkgs, pkg);
        // ffmpeg.exe is typically nested in <build>/bin/ffmpeg.exe
        const stack = [pkgDir];
        while (stack.length) {
          const dir = stack.pop();
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) stack.push(full);
            else if (e.name.toLowerCase() === 'ffmpeg.exe') candidates.push(dir);
          }
        }
      }
    } catch { /* WinGet dir not present */ }

    cached = candidates[0] || null;
    return cached;
  };
})();

// Validate that the URL is actually a YouTube URL before we pass it to yt-dlp.
// This prevents misuse (e.g., someone trying to download from other sites) and
// gives the user a clear error message if they paste a bad URL.
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    const allowed = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'];
    if (!allowed.includes(parsed.hostname)) throw new Error('Not a YouTube URL');
    return parsed.href;
  } catch {
    throw new Error('Invalid YouTube URL');
  }
}

// Parse the raw format list from yt-dlp (which can be hundreds of entries)
// and return a clean, deduplicated list for the user to choose from.
//
// YouTube typically offers the same quality in multiple codecs (e.g., H264 and VP9 for 1080p),
// so we deduplicate them. We also sort by quality so the best options appear first.
function parseFormats(rawFormats) {
  const seen = new Set();
  const formats = [];

  // Order qualities from best to worst. Used to sort the returned list.
  const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p', 'audio only'];

  for (const f of rawFormats) {
    if (!f.format_id) continue;

    const ext = f.ext || 'mp4';
    const vcodec = f.vcodec || 'none';
    const acodec = f.acodec || 'none';
    const isVideoOnly = vcodec !== 'none' && acodec === 'none';
    const isAudioOnly = vcodec === 'none' && acodec !== 'none';
    const isMuxed = vcodec !== 'none' && acodec !== 'none';

    let quality = f.format_note || '';
    if (!quality && f.height) quality = `${f.height}p`;
    if (!quality && isAudioOnly) quality = 'audio only';
    if (!quality) continue;

    // Skip m3u8/dash-only unless no other option
    if (['mhtml', 'webm', 'ts'].includes(ext) && !isMuxed) continue;

    const key = `${ext}-${quality}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tbr = f.tbr || 0;
    const duration = f.duration || 0;
    const sizeEst = tbr && duration ? Math.round((tbr * duration) / 8 / 1024 / 1024) : null;

    formats.push({
      format_id: f.format_id,
      ext,
      quality,
      vcodec: vcodec === 'none' ? null : vcodec,
      acodec: acodec === 'none' ? null : acodec,
      is_audio_only: isAudioOnly,
      is_video_only: isVideoOnly,
      size_estimate_mb: sizeEst,
      filesize: f.filesize || f.filesize_approx || null,
    });
  }

  // Sort: video formats first by quality, then audio
  formats.sort((a, b) => {
    const ai = qualityOrder.indexOf(a.quality);
    const bi = qualityOrder.indexOf(b.quality);
    const aIdx = ai === -1 ? 99 : ai;
    const bIdx = bi === -1 ? 99 : bi;
    return aIdx - bIdx;
  });

  return formats;
}

// Fetch metadata about a YouTube video without downloading it.
// This runs yt-dlp with --dump-json, which outputs video info as JSON to stdout.
// We parse that JSON and extract: title, duration, thumbnail, available formats, etc.
function getVideoInfo(url) {
  const safeUrl = sanitizeUrl(url);
  return new Promise((resolve, reject) => {
    // --dump-json: output video metadata as JSON, don't actually download
    // --no-playlist: if it's a playlist, just get info on the first video
    const args = ['--dump-json', '--no-playlist', safeUrl];
    const proc = spawn(YTDLP_BIN, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp is not installed or not on PATH. Please install it from https://github.com/yt-dlp/yt-dlp'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = stderr.toLowerCase();
        if (msg.includes('private video')) return reject(new Error('This video is private.'));
        if (msg.includes('not available')) return reject(new Error('This video is not available in your region.'));
        if (msg.includes('age')) return reject(new Error('This video is age-restricted.'));
        if (msg.includes('removed') || msg.includes('deleted')) return reject(new Error('This video has been removed.'));
        if (msg.includes('sign in')) return reject(new Error('This video requires sign-in.'));
        return reject(new Error('Could not fetch video info. The video may be unavailable.'));
      }

      try {
        const info = JSON.parse(stdout);
        const formats = parseFormats(info.formats || []);

        resolve({
          title: info.title || 'Unknown Title',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || null,
          channel: info.uploader || info.channel || 'Unknown',
          view_count: info.view_count || 0,
          upload_date: info.upload_date || null,
          description: (info.description || '').slice(0, 300),
          formats,
        });
      } catch {
        reject(new Error('Failed to parse video metadata.'));
      }
    });
  });
}

// Downloads the chosen format to a temporary file on disk and resolves with
// { filePath, ext, cleanup }. We download to a real file (not stdout) because
// merging video+audio into MP4 requires ffmpeg to seek back and write the moov
// atom — impossible on a non-seekable stdout pipe, which produces a broken file
// that plays no video.
//
// The process:
// 1. Create a unique temp directory
// 2. Tell yt-dlp to download the format to that directory
// 3. If it's a video-only format, yt-dlp uses ffmpeg to merge in the best audio
// 4. Wait for yt-dlp to finish and find the output file
// 5. Return the path so the controller can stream it to the browser
// 6. The caller must call cleanup() afterward to delete the temp directory
function downloadVideo(url, formatId, onProgress, signal) {
  const safeUrl = sanitizeUrl(url);

  return new Promise((resolve, reject) => {
    // Create a unique temporary directory for this download (e.g., /tmp/ytdl-abc123/)
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-'));
    const outputTemplate = path.join(workDir, '%(id)s.%(ext)s');

    const cleanup = () => {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    };

    // The format string is a fallback chain. yt-dlp tries each in order:
    // 1. requestedFormat + m4a audio (best audio codecs on Windows)
    // 2. requestedFormat + any bestaudio
    // 3. just requestedFormat as-is
    // This ensures we get the best possible audio and always fall back gracefully.
    const args = [
      '--no-playlist',
      '--format', `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/best[format_id=${formatId}]/${formatId}`,
      '--merge-output-format', 'mp4', // Convert to MP4 container if it's not already
      '--output', outputTemplate,
      '--no-part', // Don't write .part files (we're in a temp dir anyway)
      '--newline', // Machine-readable progress output
      safeUrl,
    ];

    // If ffmpeg was found, tell yt-dlp where it is. This is crucial on Windows
    // where ffmpeg isn't typically on PATH even if installed.
    const ffmpegDir = findFfmpegDir();
    if (ffmpegDir) args.push('--ffmpeg-location', ffmpegDir);

    // Spawn the yt-dlp process. We ignore stdin, pipe stdout (not used), and pipe stderr.
    // We track stderr because yt-dlp outputs progress updates there.
    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    // yt-dlp outputs progress to stderr (example: "[download] 45.5% of ~150MiB at 1.2MiB/s ETA 01:30")
    // We parse this to show progress to the user. The controller logs this to console.
    proc.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      stderr += line;
      // Match the progress format yt-dlp uses with --newline
      const match = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(MiB|GiB|KiB).*?at\s+([\d.]+)(KiB|MiB|GiB)\/s.*?ETA\s+([\d:]+)/);
      if (match && onProgress) {
        const percent = parseFloat(match[1]);
        const totalSize = parseFloat(match[2]);
        const totalUnit = match[3];
        const speed = parseFloat(match[4]);
        const speedUnit = match[5];
        const eta = match[6];
        onProgress({ percent, totalSize, totalUnit, speed, speedUnit, eta });
      }
    });

    proc.on('error', (err) => {
      cleanup();
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp is not installed or not on PATH.'));
      } else {
        reject(err);
      }
    });

    // Allow external abort
    if (signal) {
      signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        cleanup();
        reject(new Error('Download cancelled.'));
      });
    }

    // Wait for yt-dlp to finish and check if it succeeded
    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        // yt-dlp exited with an error. Try to give a helpful message.
        cleanup();
        const msg = stderr.toLowerCase();
        if (msg.includes('private')) return reject(new Error('This video is private.'));
        if (msg.includes('age')) return reject(new Error('This video is age-restricted.'));
        if (msg.includes('removed') || msg.includes('deleted')) return reject(new Error('This video has been removed.'));
        return reject(new Error('Download failed. The video may be unavailable.'));
      }

      // Success! yt-dlp finished and produced a file in the temp directory.
      // Find it and return its path to the controller.
      let files;
      try {
        files = fs.readdirSync(workDir).filter((f) => fs.statSync(path.join(workDir, f)).isFile());
      } catch {
        cleanup();
        return reject(new Error('Download finished but the output file was not found.'));
      }

      if (!files.length) {
        cleanup();
        return reject(new Error('Download finished but produced no file.'));
      }

      const filePath = path.join(workDir, files[0]);
      const ext = path.extname(files[0]).replace('.', '') || 'mp4';
      resolve({ filePath, ext, cleanup });
    });
  });
}

module.exports = { getVideoInfo, downloadVideo, sanitizeUrl };
