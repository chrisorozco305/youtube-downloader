# Testing Guide

This project includes comprehensive test suites for both backend and frontend.

## Setup

### Backend Tests

First, install testing dependencies:

```cmd
cd backend
npm install --save-dev jest @types/jest
```

Then, update `backend/package.json` to include the test script:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest --verbose"
}
```

### Frontend Tests

First, install testing dependencies:

```cmd
cd frontend
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom babel-jest
```

Then, update `frontend/package.json` to include the test script and Jest config:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "jest --verbose"
},
"jest": {
  "testEnvironment": "jsdom",
  "setupFilesAfterEnv": ["<rootDir>/tests/setup.js"]
}
```

Create `frontend/tests/setup.js`:

```javascript
import '@testing-library/jest-dom';
```

## Running Tests

### Backend

```cmd
cd backend
npm test
```

This will run all tests in `backend/tests/`.

### Frontend

```cmd
cd frontend
npm test
```

This will run all tests in `frontend/tests/`.

### Run All Tests

Create a root-level test script or run both manually:

```cmd
cd backend && npm test && cd ../frontend && npm test
```

## Test Coverage

### Backend Tests (`backend/tests/`)

#### `ytDlpHelper.test.js`
Tests the core yt-dlp utilities:

- **sanitizeUrl()**
  - ✅ Accepts youtube.com URLs
  - ✅ Accepts youtu.be shortlinks
  - ✅ Accepts youtube.com/shorts/
  - ✅ Rejects non-YouTube URLs
  - ✅ Rejects malformed URLs
  - ✅ Handles missing protocol

- **getVideoInfo()**
  - ✅ Fetches metadata for valid YouTube video (skipped by default — requires network)
  - ✅ Rejects invalid YouTube URL
  - ✅ Rejects private videos (skipped — requires specific URL)
  - ✅ Rejects age-restricted videos (skipped — requires specific URL)

- **downloadVideo()**
  - ✅ Downloads video to temp file and returns path (skipped by default — requires network)
  - ✅ Rejects when format_id is invalid
  - ✅ Supports abort signal for cancellation
  - ✅ Calls onProgress callback during download

#### `downloadController.test.js`
Tests the Express request handlers:

- **videoInfo endpoint**
  - ✅ Returns 400 if URL is missing
  - ✅ Returns 400 if URL is not a string
  - ✅ Returns video info on success
  - ✅ Returns error message on fetch failure

- **videoDownload endpoint**
  - ✅ Returns 400 if URL is missing
  - ✅ Returns 400 if format_id is missing
  - ✅ Sanitizes title in filename
  - ✅ Supports abort signal for cancellation
  - ✅ Returns error if download fails

### Frontend Tests (`frontend/tests/`)

#### `App.test.jsx`
Tests the main React component:

- **Initial Render**
  - ✅ Renders header with logo and title
  - ✅ Renders URL input field
  - ✅ Renders Fetch and Paste buttons
  - ✅ Renders legal disclaimer

- **URL Validation**
  - ✅ Fetch button is disabled when URL is empty
  - ✅ Fetch button is disabled with invalid URL
  - ✅ Accepts valid YouTube URL

- **Fetching Video Metadata**
  - ✅ Shows loading state while fetching
  - ✅ Displays video metadata after successful fetch
  - ✅ Displays error message on fetch failure
  - ✅ Handles backend unreachable error

- **Format Selection**
  - ✅ Auto-selects first video format
  - ✅ User can select different format

- **Downloading**
  - ✅ Download button is disabled until format is selected
  - ✅ Initiates download when Download button is clicked

- **Header Home Button**
  - ✅ Clicking header resets app to initial state

## Integration Testing

The above unit tests are good for individual components. For integration testing:

1. **E2E Testing** (Recommended): Use Playwright or Cypress to test the entire flow:
   - User pastes URL → fetches metadata → selects format → downloads file
   - Test with real YouTube videos (short ones)

2. **Manual Testing**: Use the app normally with various URLs:
   - Standard video: https://www.youtube.com/watch?v=jNQXAC9IVRw
   - Shorts: https://www.youtube.com/shorts/example
   - Playlist (should fail gracefully)
   - Age-restricted (should fail with appropriate error)
   - Deleted video (should fail with appropriate error)

## Skipped Tests

Some tests are marked with `.skip()` because they require:
- Network access to YouTube
- Real yt-dlp installation
- File I/O operations
- Specific video URLs (private, age-restricted, deleted)

To run skipped tests:

```cmd
npm test -- --no-ignore-skipped
```

Or modify `test.skip()` to `test()` in the test file.

## Mocking Strategy

### Backend
- `ytDlpHelper` functions are mocked in `downloadController.test.js`
- Express request/response objects are manually mocked
- Real file I/O is mocked in most tests

### Frontend
- `fetch` is globally mocked to test API communication
- Real network calls are not made
- User interactions are simulated with `@testing-library/user-event`

## Best Practices

1. **Run tests before committing:**
   ```cmd
   npm test
   ```

2. **Add tests for new features:**
   - Backend: Add to `backend/tests/`
   - Frontend: Add to `frontend/tests/`

3. **Keep tests isolated:**
   - Each test should be independent
   - Use `beforeEach()` to reset mocks

4. **Test edge cases:**
   - Invalid input
   - Network failures
   - User cancellation
   - Concurrent requests

## Continuous Integration

To set up automated testing on GitHub:

1. Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm install && npm test
      - run: cd frontend && npm install && npm test
```

2. Push to GitHub — tests will run automatically on every PR and push.

## Troubleshooting

### "Cannot find module"
Make sure all dependencies are installed:
```cmd
npm install
```

### "Jest not found"
Install jest as a dev dependency:
```cmd
npm install --save-dev jest
```

### "ReferenceError: fetch is not defined"
In backend tests, you may need to polyfill fetch. Consider using `node-fetch`:
```cmd
npm install --save-dev node-fetch
```

### Tests timeout
Increase Jest's timeout:
```cmd
npm test -- --testTimeout=10000
```

---

For more testing patterns, see:
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://testingjavascript.com/)
