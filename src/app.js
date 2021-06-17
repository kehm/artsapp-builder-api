import 'core-js/stable';
import 'regenerator-runtime/runtime';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import connectSessionSequelize from 'connect-session-sequelize';
import cors from 'cors';
import helmet from 'helmet';
import postgres from './config/postgres.js';
import baseRoute from './routes/base.js';
import initPostgres from './lib/database/utils/init.js';
import { logError, logInfo } from './utils/logger.js';

/**
 * Application entry point
 */
const app = express();
const SequelizeStore = connectSessionSequelize(session.Store);
const store = new SequelizeStore({
    db: postgres,
    table: 'session',
    extendDefaultFields: (defaults, session) => {
        const extension = {
            data: defaults.data,
            expires: defaults.expires,
            userId: session.userId,
        };
        return extension;
    },
    checkExpirationInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL, 10),
    expiration: parseInt(process.env.SESSION_EXPIRES, 10),
});

// Initialize middleware
app.use(session({
    name: process.env.SESSION_NAME,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store,
    /*  cookie: {
      maxAge: process.env.SESSION_MAX_AGE,
        sameSite: true,
      secure: true
     } */
}));
app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.use(helmet());
app.use(passport.initialize());
app.use(passport.session());
app.use(process.env.BUILDER_API_URL_BASE, baseRoute);

/**
 * Check database connection and start listening
 */
const run = async () => {
    try {
        await postgres.authenticate();
        await initPostgres();
        app.listen(process.env.PORT, () => logInfo(`Server started on port ${process.env.PORT} with URL base ${process.env.BUILDER_API_URL_BASE}`));
    } catch (err) {
        logError('PostgreSQL connection failed', err);
    }
};

run();
