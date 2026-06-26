// Load environment variables from .env file (PORT, FRONTEND_URL, etc.)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const downloadRoutes = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// CORS: Allow requests from the frontend. Without this, the browser blocks
// fetch() calls from frontend to backend due to same-origin policy.
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Parse incoming JSON request bodies (max 1MB to prevent abuse)
app.use(express.json({ limit: '1mb' }));

// Log all HTTP requests (helpful for debugging and monitoring)
app.use(morgan('dev'));

// Rate limiting: Prevent abuse by limiting each IP to 30 requests per 5 minutes.
// If someone hammers the API, they'll get rejected with a 429 error.
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please wait a moment.' },
});
app.use('/api/', limiter);

// Mount the download routes (POST /api/video/info and POST /api/video/download)
app.use('/api/video', downloadRoutes);

// Health check endpoint: just returns { status: 'ok' } to verify the server is running
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Catch-all for undefined routes
app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// Global error handler: catches any unhandled errors and returns a 500 response
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// Start the server and print the URL where it's accessible
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
