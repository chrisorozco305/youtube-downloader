const fs = require('fs');
const { getVideoInfo, downloadVideo } = require('../utils/ytDlpHelper');

// Handler for POST /api/video/info
// Fetches metadata about a YouTube video: title, duration, thumbnail, available formats.
// The frontend uses this to show a preview and let the user pick a quality/format.
async function videoInfo(req, res) {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL is required.' });
  }

  try {
    const data = await getVideoInfo(url.trim());
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[info] ${new Date().toISOString()} ERROR: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
}

// Handler for POST /api/video/download
// This is the main download endpoint. It orchestrates the entire process:
// 1. Call yt-dlp to download the video in the requested format
// 2. Merge audio+video if needed (using ffmpeg)
// 3. Stream the finished file back to the client's browser
// 4. Clean up temporary files afterward
async function videoDownload(req, res) {
  const { url, format_id, title } = req.body;
  if (!url || !format_id) {
    return res.status(400).json({ success: false, error: 'url and format_id are required.' });
  }

  // Sanitize the video title to make it a safe filename (remove special chars, limit length)
  const safeTitle = (title || 'video').replace(/[^\w\s\-().]/g, '').trim().slice(0, 120) || 'video';
  console.log(`[download] ${new Date().toISOString()} url=${url} format=${format_id}`);

  // AbortController allows the frontend to cancel the download while yt-dlp is still working.
  // If the user closes the browser tab or clicks "Cancel", we kill the yt-dlp process.
  let downloading = true;
  const ac = new AbortController();
  res.on('close', () => { if (downloading) ac.abort(); });

  try {
    // Log download progress to the server console (for debugging/monitoring)
    const onProgress = ({ percent, speed, speedUnit, eta }) => {
      process.stdout.write(`\r  ${percent.toFixed(1)}%  ${speed}${speedUnit}/s  ETA ${eta}   `);
    };

    // Call yt-dlp to do the actual download. This returns the path to the finished file.
    // downloadVideo() handles merging video+audio with ffmpeg if needed, then exits yt-dlp.
    const { filePath, ext, cleanup } = await downloadVideo(url.trim(), format_id, onProgress, ac.signal);
    downloading = false;

    // Get the file size so we can tell the browser the exact length
    const stat = fs.statSync(filePath);
    const videoExts = ['mp4', 'mkv', 'webm', 'mov'];
    const contentType = ext === 'mp4'
      ? 'video/mp4'
      : videoExts.includes(ext) ? `video/${ext}` : `audio/${ext}`;

    // Set HTTP headers so the browser treats this as a downloadable file, not a webpage
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${ext}"`);
    res.setHeader('Content-Length', stat.size); // Browser uses this for accurate progress bars

    // Stream the file to the client. This is memory-efficient even for large files.
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // If something goes wrong while streaming the file, clean up and close the connection
    fileStream.on('error', (err) => {
      console.error(`\n[download] stream error: ${err.message}`);
      cleanup();
      res.destroy();
    });

    // Clean up the temporary file after the download completes or if the client disconnects
    res.on('close', cleanup);
    res.on('finish', () => {
      console.log(`\n[download] completed: ${safeTitle}.${ext}`);
    });
  } catch (err) {
    console.error(`\n[download] ERROR: ${err.message}`);
    // Only send an error response if we haven't already started sending the file
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = { videoInfo, videoDownload };
