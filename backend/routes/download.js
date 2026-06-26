const express = require('express');
const router = express.Router();
const { videoInfo, videoDownload } = require('../controllers/downloadController');

router.post('/info', videoInfo);
router.post('/download', videoDownload);

module.exports = router;
