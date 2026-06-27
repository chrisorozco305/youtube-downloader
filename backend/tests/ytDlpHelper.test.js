const EventEmitter = require('events');

// Mock child_process.spawn so tests never actually call yt-dlp.
// We set this up before requiring the module under test.
jest.mock('child_process', () => ({ spawn: jest.fn() }));
const { spawn } = require('child_process');

const { sanitizeUrl, getVideoInfo } = require('../utils/ytDlpHelper');

// Build a fake yt-dlp process that emits the provided stdout/stderr and then closes.
function mockProc({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  process.nextTick(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });
  return proc;
}

beforeEach(() => {
  spawn.mockClear();
});

// ---------------------------------------------------------------------------
// sanitizeUrl — pure function, no mocking needed
// ---------------------------------------------------------------------------
describe('sanitizeUrl', () => {
  test('accepts standard youtube.com watch URL', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(sanitizeUrl(url)).toBe(url);
  });

  test('accepts youtu.be short link', () => {
    expect(() => sanitizeUrl('https://youtu.be/dQw4w9WgXcQ')).not.toThrow();
  });

  test('accepts youtube.com/shorts/', () => {
    expect(() => sanitizeUrl('https://www.youtube.com/shorts/abc123')).not.toThrow();
  });

  test('accepts music.youtube.com', () => {
    expect(() => sanitizeUrl('https://music.youtube.com/watch?v=abc123')).not.toThrow();
  });

  test('accepts m.youtube.com (mobile)', () => {
    expect(() => sanitizeUrl('https://m.youtube.com/watch?v=abc123')).not.toThrow();
  });

  test('rejects a non-YouTube domain', () => {
    expect(() => sanitizeUrl('https://vimeo.com/123456')).toThrow('Not a YouTube URL');
  });

  test('rejects a subdomain spoof (youtube.com.evil.com)', () => {
    expect(() => sanitizeUrl('https://youtube.com.evil.com/watch?v=abc')).toThrow('Not a YouTube URL');
  });

  test('rejects a plain non-URL string', () => {
    expect(() => sanitizeUrl('not a url')).toThrow('Invalid YouTube URL');
  });

  test('rejects URL without protocol', () => {
    // The URL constructor requires a protocol — bare hostnames throw
    expect(() => sanitizeUrl('www.youtube.com/watch?v=abc')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getVideoInfo — uses spawn, so we test with mock processes
// ---------------------------------------------------------------------------
describe('getVideoInfo', () => {
  test('rejects immediately for invalid URL (no spawn needed)', async () => {
    // sanitizeUrl throws before spawn is ever called
    await expect(getVideoInfo('not a url')).rejects.toThrow('Invalid YouTube URL');
    expect(spawn).not.toHaveBeenCalled();
  });

  test('rejects for non-YouTube URL', async () => {
    await expect(getVideoInfo('https://vimeo.com/123')).rejects.toThrow('Not a YouTube URL');
    expect(spawn).not.toHaveBeenCalled();
  });

  test('resolves with parsed metadata when yt-dlp outputs valid JSON', async () => {
    const fakeInfo = {
      title: 'Never Gonna Give You Up',
      duration: 213,
      thumbnail: 'https://example.com/thumb.jpg',
      uploader: 'Rick Astley',
      view_count: 1000000,
      upload_date: '20091025',
      description: 'Short description',
      formats: [
        { format_id: '22', ext: 'mp4', format_note: '720p', vcodec: 'avc1', acodec: 'mp4a' },
        { format_id: '251', ext: 'm4a', format_note: 'audio only', vcodec: 'none', acodec: 'opus' },
      ],
    };
    spawn.mockReturnValueOnce(mockProc({ stdout: JSON.stringify(fakeInfo) }));

    const result = await getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result.title).toBe('Never Gonna Give You Up');
    expect(result.channel).toBe('Rick Astley');
    expect(result.duration).toBe(213);
    expect(Array.isArray(result.formats)).toBe(true);
    expect(result.formats.length).toBeGreaterThan(0);
  });

  test('rejects with helpful message when yt-dlp exits with error', async () => {
    spawn.mockReturnValueOnce(mockProc({ stderr: 'Video unavailable', exitCode: 1 }));
    await expect(getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .rejects.toThrow('Could not fetch video info');
  });

  test('rejects with "private video" message when stderr says so', async () => {
    spawn.mockReturnValueOnce(mockProc({ stderr: 'ERROR: This is a private video', exitCode: 1 }));
    await expect(getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .rejects.toThrow('private');
  });

  test('rejects with "age-restricted" message when stderr says so', async () => {
    spawn.mockReturnValueOnce(mockProc({ stderr: 'ERROR: Sign in to confirm your age', exitCode: 1 }));
    await expect(getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .rejects.toThrow('age');
  });

  test('rejects when yt-dlp is not installed (ENOENT)', async () => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    process.nextTick(() => proc.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' })));
    spawn.mockReturnValueOnce(proc);

    await expect(getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .rejects.toThrow('yt-dlp is not installed');
  });

  test('rejects with parse error when yt-dlp outputs invalid JSON', async () => {
    spawn.mockReturnValueOnce(mockProc({ stdout: 'this is not json', exitCode: 0 }));
    await expect(getVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .rejects.toThrow('Failed to parse video metadata');
  });
});
