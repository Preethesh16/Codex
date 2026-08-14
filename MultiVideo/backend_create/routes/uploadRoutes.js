const multer = require('multer');
const requireLogin = require('../middlewares/requireLogin');
const Video = require('../models/Video');
const fs = require('fs');
const path = require('path');

const uploadDirectory = path.resolve(process.env.MULTIVIDEO_UPLOAD_DIR || 'uploads');

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDirectory)) fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
        cb(null, uploadDirectory);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + safeOriginal);
    }
});

const allowedVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 10 },
    fileFilter: (_req, file, cb) => allowedVideoTypes.has(file.mimetype)
        ? cb(null, true)
        : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'video'))
});

module.exports = (app) => {
    app.post('/api/upload', requireLogin, upload.single('video'), async (req, res) => {
        const { title, description } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).send({ error: 'No file uploaded' });
        }

        const video = new Video({
            userId: req.user._id,
            title: title || file.originalname,
            description: description || '',
            filePath: file.path,
            mimeType: file.mimetype,
            status: 'uploaded'
        });

        await video.save();
        res.send(video);
    });

    app.get('/api/videos', requireLogin, async (req, res) => {
        const videos = await Video.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.send(videos);
    });
};
