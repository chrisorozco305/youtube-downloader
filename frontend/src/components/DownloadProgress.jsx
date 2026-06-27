import React from 'react';

export default function DownloadProgress({ progress, onCancel, success, error }) {
  if (success) {
    return (
      <div className="success-banner">
        ✅ Download complete! Check your Downloads folder.
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-msg" style={{ fontSize: '0.88rem', padding: '12px 0' }}>
        ⚠ {error}
      </div>
    );
  }

  if (!progress) return null;

  const { percent = 0, speed, speedUnit, eta, received, total } = progress;
  const displayPct = Math.min(Math.max(Math.round(percent), 0), 100);

  // Fallback: compute percent from bytes if yt-dlp percent not available
  const bytePct = total && received ? Math.round((received / total) * 100) : null;
  const pct = percent > 0 ? displayPct : (bytePct ?? 0);

  let speedLabel = '';
  if (speed && speedUnit) speedLabel = `${speed} ${speedUnit}/s`;
  else if (received) {
    const mb = (received / 1024 / 1024).toFixed(1);
    speedLabel = total
      ? `${mb} / ${(total / 1024 / 1024).toFixed(1)} MB`
      : `${mb} MB received`;
  }

  return (
    <div className="progress-wrap">
      <div className="progress-header">
        <span>Downloading…</span>
        <span>{pct}%</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-stats">
        {speedLabel && <span>📶 {speedLabel}</span>}
        {eta && eta !== '00:00' && <span>⏳ ETA {eta}</span>}
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '0.75rem' }}
          onClick={onCancel}
        >
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}
