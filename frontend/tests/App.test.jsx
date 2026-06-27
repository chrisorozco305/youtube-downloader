import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock URL.createObjectURL (not available in jsdom)
global.URL.createObjectURL = jest.fn(() => 'blob:mock');
global.URL.revokeObjectURL = jest.fn();

// Helper: a real 11-char YouTube video ID so the frontend regex passes
const VALID_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// Helper: mock video metadata response
const mockVideoData = {
  title: 'Never Gonna Give You Up',
  duration: 213,
  thumbnail: null,
  channel: 'Rick Astley',
  view_count: 1000000,
  formats: [
    { format_id: '22', ext: 'mp4', quality: '720p', is_audio_only: false },
    { format_id: '251', ext: 'm4a', quality: 'audio only', is_audio_only: true },
  ],
};

// Helper: mock a successful /info response
function mockInfoSuccess(data = mockVideoData) {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data }),
  });
}

// Helper: fetch metadata and wait for it to render
async function fetchVideo(user, url = VALID_URL) {
  const input = screen.getByPlaceholderText(/youtube.com/i);
  await user.clear(input);
  await user.type(input, url);
  await user.click(screen.getByRole('button', { name: /🔍 Fetch/i }));
  await waitFor(() => {
    expect(screen.getByText('Never Gonna Give You Up')).toBeInTheDocument();
  });
}

beforeEach(() => {
  fetch.mockClear();
});

describe('App Component', () => {
  describe('Initial Render', () => {
    test('renders header with logo and title', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: /YT Downloader/i })).toBeInTheDocument();
    });

    test('renders URL input field', () => {
      render(<App />);
      expect(screen.getByPlaceholderText(/youtube.com/i)).toBeInTheDocument();
    });

    test('renders Fetch and Paste buttons', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: /🔍 Fetch/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /📋 Paste/i })).toBeInTheDocument();
    });

    test('renders legal disclaimer', () => {
      render(<App />);
      expect(screen.getByText(/Legal Notice/i)).toBeInTheDocument();
      expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
    });
  });

  describe('URL Validation', () => {
    test('Fetch button is disabled when URL is empty', () => {
      render(<App />);
      expect(screen.getByRole('button', { name: /🔍 Fetch/i })).toBeDisabled();
    });

    test('shows error when invalid URL is submitted', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.type(screen.getByPlaceholderText(/youtube.com/i), 'not a url');
      await user.click(screen.getByRole('button', { name: /🔍 Fetch/i }));
      expect(screen.getByText(/valid YouTube URL/i)).toBeInTheDocument();
    });

    test('Fetch button is enabled with a valid YouTube URL', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.type(screen.getByPlaceholderText(/youtube.com/i), VALID_URL);
      expect(screen.getByRole('button', { name: /🔍 Fetch/i })).not.toBeDisabled();
    });
  });

  describe('Fetching Video Metadata', () => {
    test('shows loading state while fetching', async () => {
      const user = userEvent.setup();
      render(<App />);
      // Never-resolving promise simulates a slow request
      fetch.mockImplementationOnce(() => new Promise(() => {}));
      await user.type(screen.getByPlaceholderText(/youtube.com/i), VALID_URL);
      await user.click(screen.getByRole('button', { name: /🔍 Fetch/i }));
      expect(screen.getByText(/Fetching/i)).toBeInTheDocument();
    });

    test('displays video title and channel after successful fetch', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      expect(screen.getByText('Never Gonna Give You Up')).toBeInTheDocument();
      expect(screen.getByText(/Rick Astley/i)).toBeInTheDocument();
    });

    test('displays error when backend returns failure', async () => {
      const user = userEvent.setup();
      render(<App />);
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Video not found' }),
      });
      await user.type(screen.getByPlaceholderText(/youtube.com/i), VALID_URL);
      await user.click(screen.getByRole('button', { name: /🔍 Fetch/i }));
      await waitFor(() => {
        expect(screen.getByText(/Video not found/i)).toBeInTheDocument();
      });
    });

    test('shows backend unreachable error when fetch throws', async () => {
      const user = userEvent.setup();
      render(<App />);
      fetch.mockRejectedValueOnce(new Error('Failed to fetch'));
      await user.type(screen.getByPlaceholderText(/youtube.com/i), VALID_URL);
      await user.click(screen.getByRole('button', { name: /🔍 Fetch/i }));
      await waitFor(() => {
        expect(screen.getByText(/Backend unreachable/i)).toBeInTheDocument();
      });
    });
  });

  describe('Format Selection', () => {
    test('shows format options after fetching', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      // Both formats should be visible
      expect(screen.getByText('720p')).toBeInTheDocument();
      expect(screen.getByText('audio only')).toBeInTheDocument();
    });

    test('auto-selects the first video format (not audio-only)', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      // The Download button should mention 720p (the auto-selected format)
      expect(screen.getByRole('button', { name: /⬇ Download Video · 720p/i })).toBeInTheDocument();
    });

    test('user can select audio-only format', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      // Click the audio only format button
      fireEvent.click(screen.getByText('audio only').closest('button'));
      // Download button should update to say Audio
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /⬇ Download Audio/i })).toBeInTheDocument();
      });
    });
  });

  describe('Download Button', () => {
    test('Download button is not shown before fetching a video', () => {
      render(<App />);
      // Only the header and Fetch/Paste buttons should be present — no Download button
      expect(screen.queryByRole('button', { name: /⬇ Download/i })).not.toBeInTheDocument();
    });

    test('Download button appears after fetching a video', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      expect(screen.getByRole('button', { name: /⬇ Download/i })).toBeInTheDocument();
    });
  });

  describe('Header Home Button', () => {
    test('clicking the header clears the video metadata', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      // Video is showing
      expect(screen.getByText('Never Gonna Give You Up')).toBeInTheDocument();
      // Click the header home button
      await user.click(screen.getByRole('button', { name: /YT Downloader/i }));
      // Video should be gone
      expect(screen.queryByText('Never Gonna Give You Up')).not.toBeInTheDocument();
    });

    test('clicking the header clears the Download button', async () => {
      const user = userEvent.setup();
      render(<App />);
      mockInfoSuccess();
      await fetchVideo(user);
      expect(screen.getByRole('button', { name: /⬇ Download/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /YT Downloader/i }));
      expect(screen.queryByRole('button', { name: /⬇ Download/i })).not.toBeInTheDocument();
    });
  });
});
