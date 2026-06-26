import { useState } from 'react';

const YT_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w\-]{11}/;

export default function VideoInput({ onFetch, loading }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function validate(value) {
    if (!value.trim()) return 'Please enter a YouTube URL.';
    if (!YT_REGEX.test(value.trim())) return 'Please enter a valid YouTube URL.';
    return '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate(url);
    if (err) { setError(err); return; }
    setError('');
    onFetch(url.trim());
  }

  function handleChange(e) {
    setUrl(e.target.value);
    if (error) setError('');
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
    } catch {
      setError('Could not read clipboard. Paste manually.');
    }
  }

  return (
    <div className="card url-input-section">
      <label htmlFor="yt-url">YouTube URL</label>
      <form onSubmit={handleSubmit}>
        <div className="url-row">
          <input
            id="yt-url"
            type="text"
            className={`url-input${error ? ' error' : ''}`}
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={handleChange}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePaste}
            title="Paste from clipboard"
          >
            📋 Paste
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !url.trim()}
          >
            {loading ? <><span className="spinner" /> Fetching…</> : '🔍 Fetch'}
          </button>
        </div>
      </form>
      {error && <p className="error-msg">⚠ {error}</p>}
    </div>
  );
}
