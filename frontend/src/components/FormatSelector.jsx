import React from 'react';

function formatSize(mb) {
  if (mb === null || mb === undefined) return null;
  if (mb < 1) return `~${Math.round(mb * 1024)} KB`;
  return `~${mb} MB`;
}

export default function FormatSelector({ formats, selected, onSelect }) {
  if (!formats?.length) return null;

  return (
    <div className="card format-section">
      <h2>Format &amp; Quality</h2>
      <div className="format-grid">
        {formats.map((f) => {
          const isSelected = selected?.format_id === f.format_id;
          const isAudio = f.is_audio_only;
          const size = f.filesize
            ? formatSize(Math.round(f.filesize / 1024 / 1024))
            : formatSize(f.size_estimate_mb);

          return (
            <button
              key={f.format_id}
              className={`format-option${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(f)}
            >
              <div className="format-radio">
                {isSelected && <div className="format-radio-dot" />}
              </div>

              <span className={`format-badge ${isAudio ? 'badge-audio' : 'badge-video'}`}>
                {isAudio ? 'Audio' : f.ext?.toUpperCase() || 'Video'}
              </span>

              <div className="format-label">
                <div className="format-quality">{f.quality}</div>
                {!isAudio && (
                  <div className="format-ext">
                    {f.ext?.toUpperCase()}
                    {f.vcodec && ` · ${f.vcodec.split('.')[0]}`}
                    {f.acodec && ` · ${f.acodec.split('.')[0]}`}
                  </div>
                )}
                {isAudio && (
                  <div className="format-ext">
                    {f.ext?.toUpperCase()}
                    {f.acodec && ` · ${f.acodec.split('.')[0]}`}
                  </div>
                )}
              </div>

              {size && <span className="format-size">{size}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
