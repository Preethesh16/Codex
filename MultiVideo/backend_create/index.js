const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const passport = require('passport');
const cors = require('cors');
const connectDB = require('./config/db');
const { createRateLimit } = require('./middlewares/rateLimit');
require('./services/passport');

const app = express();

// Database Connection
connectDB();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:8080',
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(['/api/upload', '/api/publish', '/api/connect'], createRateLimit({ limit: 30, windowMs: 60_000 }));

const cookieKey = process.env.COOKIE_KEY;
if (!cookieKey && process.env.NODE_ENV === 'production') throw new Error('COOKIE_KEY is required in production');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(session({
    secret: cookieKey || 'development-only-cookie-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
require('./routes/authRoutes')(app);
require('./routes/uploadRoutes')(app);
require('./routes/publishRoutes')(app);
require('./routes/connectionRoutes')(app);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
