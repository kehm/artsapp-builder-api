import express from 'express';
import { Issuer, Strategy } from 'openid-client';
import passport from 'passport';
import User from '../lib/database/models/User.js';
import { isAuthenticated } from '../middleware/auth.js';
import { createUserIfNotExists, getUserProfile, isTokenValid } from '../utils/auth.js';
import { decryptSha256 } from '../utils/encryption.js';
import { logError } from '../utils/logger.js';

/**
 * Routes for handling authentication
 */
const router = express.Router();

Issuer.discover(process.env.OIDC_DISCOVERY_ENDPOINT).then((idp) => {
    const client = new idp.Client({
        client_id: process.env.OIDC_CLIENT_ID,
        client_secret: process.env.OIDC_CLIENT_SECRET,
        redirect_uris: [process.env.OIDC_REDIRECT_URI],
        post_logout_redirect_uris: [process.env.OIDC_LOGOUT_URI],
        token_endpoint_auth_method: 'client_secret_post',
    });

    /**
     * OpenID authentication strategy
     */
    passport.use('oidc', new Strategy({ client }, async (tokenSet, userInfo, done) => {
        try {
            if (isTokenValid(tokenSet.claims())) {
                const user = await createUserIfNotExists(tokenSet, userInfo);
                done(null, user);
            } else done(null, null);
        } catch (err) {
            logError('OIDC authentication process failed', err);
        }
    }));

    /**
     * Save user object in session
     */
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    /**
     * Get user object in session
     */
    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    /**
     * Authenticate with ORCID
     */
    router.get('/oidc', passport.authenticate('oidc'));

    /**
     * OpenID authentication callback
     */
    router.get('/oidc/callback', passport.authenticate('oidc', {
        successRedirect: process.env.BUILDER_URL_BASE,
        failureRedirect: `${process.env.BUILDER_URL_BASE}/signin/error`,
    }));

    /**
     * Check if session exists and return user profile object
     */
    router.post('/', isAuthenticated, async (req, res) => {
        const user = await getUserProfile(req.user);
        res.status(200).json({ user });
    });

    /**
     * Get OpenID logout URL
     */
    router.get('/logout/url', isAuthenticated, async (req, res) => {
        try {
            const user = await User.findByPk(req.user);
            res.status(200).json({
                logoutUrl: client.endSessionUrl({
                    id_token_hint: decryptSha256(process.env.ENCRYPTION_SECRET, Buffer.from(user.idToken, 'base64')).toString('utf-8'),
                }),
            });
        } catch (err) {
            logError('Could not logout user', err);
            res.sendStatus(500);
        }
    });

    /**
     * Destroy session
     */
    router.get('/logout/callback', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                res.sendStatus(500);
            } else {
                res.clearCookie(process.env.SESSION_NAME);
                res.redirect('/');
            }
        });
    });
}).catch((err) => logError('OpenID discover failed', err));

export default router;
