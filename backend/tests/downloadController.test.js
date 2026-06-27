// jest.mock calls are hoisted to the top of the file by Jest's babel transform,
// so they run before any require() calls — including the controller's require('fs').
jest.mock('../utils/ytDlpHelper');
jest.mock('fs');

const { videoInfo, videoDownload } = require('../controllers/downloadController');
const { getVideoInfo, downloadVideo } = require('../utils/ytDlpHelper');
const fs = require('fs');

// Build a minimal Express-compatible mock response object
function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
    headersSent: false,
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// videoInfo handler
// ---------------------------------------------------------------------------
describe('videoInfo', () => {
  test('returns 400 when url is missing', async () => {
    const res = mockRes();
    await videoInfo({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'URL is required.' });
  });

  test('returns 400 when url is not a string', async () => {
    const res = mockRes();
    await videoInfo({ body: { url: 42 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'URL is required.' });
  });

  test('returns 200 with data on success', async () => {
    const fakeData = { title: 'Test Video', duration: 120, formats: [] };
    getVideoInfo.mockResolvedValueOnce(fakeData);

    const res = mockRes();
    await videoInfo({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }, res);

    expect(getVideoInfo).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    // status() should NOT have been called (default 200)
    expect(res.status).not.toHaveBeenCalled();
  });

  test('trims whitespace from the URL before calling getVideoInfo', async () => {
    getVideoInfo.mockResolvedValueOnce({ title: 'x', formats: [] });
    const res = mockRes();
    await videoInfo({ body: { url: '  https://www.youtube.com/watch?v=abc  ' } }, res);
    expect(getVideoInfo).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc');
  });

  test('returns 400 with the error message when getVideoInfo throws', async () => {
    getVideoInfo.mockRejectedValueOnce(new Error('This video is private.'));
    const res = mockRes();
    await videoInfo({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'This video is private.' });
  });
});

// ---------------------------------------------------------------------------
// videoDownload handler
// ---------------------------------------------------------------------------
describe('videoDownload', () => {
  test('returns 400 when url is missing', async () => {
    const res = mockRes();
    await videoDownload({ body: { format_id: '22' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'url and format_id are required.' });
  });

  test('returns 400 when format_id is missing', async () => {
    const res = mockRes();
    await videoDownload({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'url and format_id are required.' });
  });

  test('returns 500 with error message when downloadVideo throws', async () => {
    downloadVideo.mockRejectedValueOnce(new Error('This video is age-restricted.'));
    const res = mockRes();
    // res.on is called inside the controller to listen for 'close' — the mock ignores it
    await videoDownload({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format_id: '22' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'This video is age-restricted.' });
  });

  test('strips special characters from the title for a safe filename', async () => {
    // The controller sanitizes the title before using it in Content-Disposition.
    // We verify this by checking the header value after a successful mock download.
    const mockStream = Object.assign(require('events').EventEmitter.prototype, {});
    const fakeStream = { pipe: jest.fn(), on: jest.fn() };
    fs.statSync.mockReturnValueOnce({ size: 1024 });
    fs.createReadStream.mockReturnValueOnce(fakeStream);
    downloadVideo.mockResolvedValueOnce({ filePath: '/tmp/ytdl-abc/video.mp4', ext: 'mp4', cleanup: jest.fn() });

    const res = mockRes();
    await videoDownload({
      body: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        format_id: '22',
        title: 'Rick <Astley> "Never"',
      },
    }, res);

    // Extract just the filename from Content-Disposition (the quotes are valid HTTP syntax)
    const disposition = res.setHeader.mock.calls.find(([k]) => k === 'Content-Disposition')?.[1];
    expect(disposition).toBeDefined();
    const filename = disposition.match(/filename="(.+?)"/)?.[1] ?? '';
    expect(filename).not.toMatch(/[<>]/);
  });

  test('sets Content-Length header to the file size', async () => {
    const fakeStream = { pipe: jest.fn(), on: jest.fn() };
    fs.statSync.mockReturnValueOnce({ size: 5000000 });
    fs.createReadStream.mockReturnValueOnce(fakeStream);
    downloadVideo.mockResolvedValueOnce({ filePath: '/tmp/ytdl-abc/video.mp4', ext: 'mp4', cleanup: jest.fn() });

    const res = mockRes();
    await videoDownload({
      body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format_id: '22', title: 'Test' },
    }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 5000000);
  });

  test('does not send an error response when headers are already sent', async () => {
    downloadVideo.mockRejectedValueOnce(new Error('late error'));
    const res = mockRes();
    res.headersSent = true; // simulate headers already flushed
    await videoDownload({ body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format_id: '22' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
