import { useState, useRef } from 'react';
import VideoInput from './components/VideoInput.jsx';
import MetadataDisplay from './components/MetadataDisplay.jsx';
import FormatSelector from './components/FormatSelector.jsx';
import DownloadProgress from './components/DownloadProgress.jsx';

const API = '/api/video'; // Vite proxy routes /api/* to the backend at localhost:5000

export default function App() {
  // State for fetching video metadata (step 1)
  const [fetchLoading, setFetchLoading] = useState(false);
  const [videoData, setVideoData] = useState(null); // { title, duration, thumbnail, formats... }
  const [fetchError, setFetchError] = useState('');

  // State for format selection (step 2)
  const [selectedFormat, setSelectedFormat] = useState(null); // { format_id, ext, quality... }

  // State for downloading (step 3)
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null); // { percent, received, total, speed, speedUnit, eta }
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const abortRef = useRef(null);
  const currentUrlRef = useRef('');

  // Step 1: User pasted a YouTube URL, now fetch its metadata
  // This calls POST /api/video/info which runs yt-dlp to get: title, duration,
  // available formats/qualities, thumbnail, etc. Then we auto-select the best format.
  async function handleFetch(url) {
    // Clear all previous state to start fresh
    setFetchLoading(true);
    setVideoData(null);
    setFetchError('');
    setSelectedFormat(null);
    setDownloadSuccess(false);
    setDownloadError('');
    setProgress(null);
    // Save the URL so we can use it later when the user actually downloads
    currentUrlRef.current = url;

    try {
      const res = await fetch(`${API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      // Parse the JSON response, with special handling if the backend is down
      let json;
      try {
        json = await res.json();
      } catch {
        if (!res.ok) throw new Error(`Backend unreachable (${res.status}). Is the backend server running on port 5000?`);
        throw new Error('Received an invalid response from the server.');
      }

      if (!json.success) throw new Error(json.error || 'Failed to fetch video info.');

      // Save the metadata and auto-select the best format
      setVideoData(json.data);
      // Auto-select first non-audio-only format (best quality video), else first
      const best = json.data.formats?.find((f) => !f.is_audio_only) || json.data.formats?.[0];
      setSelectedFormat(best || null);
    } catch (err) {
      // Show a helpful error message to the user
      setFetchError(
        err.message === 'Failed to fetch'
          ? 'Backend unreachable. Make sure the backend server is running on port 5000.'
          : err.message
      );
    } finally {
      setFetchLoading(false);
    }
  }

  // Step 2: User clicked the "Download" button. Tell the backend to download the
  // video in the selected format, stream it to us as a blob, and save it locally.
  async function handleDownload() {
    if (!videoData || !selectedFormat) return;

    setDownloading(true);
    setDownloadSuccess(false);
    setDownloadError('');
    setProgress({ percent: 0 });

    // AbortController lets us cancel the fetch (and the backend's download) if the user closes the tab
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      // Request the backend to download. It will run yt-dlp, merge audio+video if needed, and stream the result back.
      const res = await fetch(`${API}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentUrlRef.current,
          format_id: selectedFormat.format_id,
          title: videoData.title,
        }),
        signal: ac.signal,
      });

      // Handle HTTP errors from the backend
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error) throw new Error(json.error);
        if (res.status === 0 || res.type === 'error') throw new Error('Backend unreachable. Is the backend server running on port 5000?');
        throw new Error(`Server error ${res.status}`);
      }

      // The backend is streaming the video file. We read it in chunks and track progress.
      // This works even for large files because we don't load the whole thing into memory.
      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : null;
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        // Update progress bar: bytes received out of total file size
        setProgress({ percent: total ? (received / total) * 100 : 0, received, total });
      }

      // Assemble the chunks into a single blob (the complete video file) and
      // trigger the browser's download dialog so the user can save it.
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (videoData.title || 'video').replace(/[^\w\s\-().]/g, '').trim();
      a.href = blobUrl;
      a.download = `${safeName}.${selectedFormat.is_audio_only ? selectedFormat.ext : 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setDownloadSuccess(true);
      setProgress(null);
    } catch (err) {
      // Handle different types of errors with helpful messages
      if (err.name === 'AbortError') {
        setDownloadError('Download cancelled.');
      } else if (err.message === 'Failed to fetch') {
        setDownloadError('Backend unreachable. Is the backend server running on port 5000?');
      } else {
        setDownloadError(err.message);
      }
      setProgress(null);
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="header-home-btn"
          onClick={() => {
            abortRef.current?.abort();
            setVideoData(null);
            setSelectedFormat(null);
            setFetchError('');
            setDownloadSuccess(false);
            setDownloadError('');
            setProgress(null);
            setDownloading(false);
            setFetchLoading(false);
            currentUrlRef.current = '';
          }}
          title="Go back to home"
        >
          <svg className="logo" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#ff0000" />
            <polygon points="13,10 23,16 13,22" fill="white" />
          </svg>
          <h1>YT <span>Downloader</span></h1>
        </button>
      </header>

      <main className="main">
        <VideoInput onFetch={handleFetch} loading={fetchLoading} />

        {fetchError && (
          <div className="card" style={{ padding: '16px 24px' }}>
            <p className="error-msg" style={{ fontSize: '0.9rem' }}>⚠ {fetchError}</p>
          </div>
        )}

        <MetadataDisplay data={videoData} loading={fetchLoading} />

        {videoData && (
          <FormatSelector
            formats={videoData.formats}
            selected={selectedFormat}
            onSelect={setSelectedFormat}
          />
        )}

        {videoData && selectedFormat && (
          <div className="card download-section">
            {(downloading || downloadSuccess || downloadError) && (
              <DownloadProgress
                progress={progress}
                onCancel={handleCancel}
                success={downloadSuccess}
                error={downloadError}
              />
            )}

            {!downloading && !downloadSuccess && (
              <div className="download-btn-row">
                <button
                  className="btn btn-primary btn-download"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  ⬇ Download {selectedFormat.is_audio_only ? 'Audio' : 'Video'}
                  {selectedFormat.quality ? ` · ${selectedFormat.quality}` : ''}
                </button>
                {downloadSuccess && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setDownloadSuccess(false);
                      setDownloadError('');
                      setProgress(null);
                    }}
                  >
                    ↩ Reset
                  </button>
                )}
              </div>
            )}

            {downloadSuccess && (
              <div className="download-btn-row" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDownloadSuccess(false);
                    setDownloadError('');
                    setProgress(null);
                    setVideoData(null);
                    setSelectedFormat(null);
                    setFetchError('');
                    currentUrlRef.current = '';
                  }}
                >
                  ↩ Download Another
                </button>
              </div>
            )}
          </div>
        )}

        <div className="disclaimer">
          <strong>⚠ Legal Notice:</strong> This tool is for downloading videos you have
          permission to download. Users are responsible for complying with YouTube's Terms
          of Service and applicable copyright laws. Respect creators' intellectual property.
          This is for personal and educational use only.
        </div>
      </main>
    </div>
  );
}
