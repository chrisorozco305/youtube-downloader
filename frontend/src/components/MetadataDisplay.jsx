function formatDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}

export default function MetadataDisplay({ data, loading }) {
  if (loading) {
    return (
      <div className="card">
        <div className="metadata-card">
          <div className="thumbnail-wrap skeleton" style={{ minHeight: 90 }} />
          <div className="meta-info" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton" style={{ height: 18, width: '80%' }} />
            <div className="skeleton" style={{ height: 14, width: '50%' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 20 }} />
              <div className="skeleton" style={{ height: 22, width: 80, borderRadius: 20 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="card">
      <div className="metadata-card">
        <div className="thumbnail-wrap">
          {data.thumbnail
            ? <img src={data.thumbnail} alt={data.title} loading="lazy" />
            : <div className="thumbnail-placeholder">🎬</div>
          }
        </div>
        <div className="meta-info">
          <p className="meta-title" title={data.title}>{data.title}</p>
          <div className="meta-tags">
            {data.channel && <span className="tag">📺 {data.channel}</span>}
            {data.duration > 0 && <span className="tag">⏱ {formatDuration(data.duration)}</span>}
            {data.view_count > 0 && <span className="tag">👁 {formatViews(data.view_count)}</span>}
            {data.formats?.length > 0 && (
              <span className="tag">📦 {data.formats.length} formats</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
