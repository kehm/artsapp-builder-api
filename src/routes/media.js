import express from 'express';
import Sequelize from 'sequelize';
import {
    body, oneOf, param, query,
} from 'express-validator';
import fs from 'fs';
import path from 'path';
import KeyMedia from '../lib/database/models/KeyMedia.js';
import upload from '../middleware/upload.js';
import Media from '../lib/database/models/Media.js';
import { logError } from '../utils/logger.js';
import {
    resizeImages, handleSetMediaInfo, deleteMedia,
    updateMediaElement, removeFromRevision,
} from '../utils/media.js';
import GroupMedia from '../lib/database/models/GroupMedia.js';
import CollectionMedia from '../lib/database/models/CollectionMedia.js';
import MediaInfo from '../lib/database/models/MediaInfo.js';
import Revision from '../lib/database/models/Revision.js';
import { isAuthenticated, isPermitted } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';

/**
 * Routes for managing media
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get media file
 */
router.get('/:mediaId', [
    param('mediaId').isInt(),
], isValidInput, async (req, res) => {
    try {
        const media = await Media.findByPk(req.params.mediaId);
        if (media && media.filePath) {
            if (fs.existsSync(media.filePath)) {
                const resolvedPath = path.resolve(media.filePath);
                res.sendFile(resolvedPath);
            } else {
                logError('File path does not exist');
                res.sendStatus(500);
            }
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not get media file', err);
        res.sendStatus(500);
    }
});

/**
 * Get media file thumbnail
 */
router.get('/thumbnails/:mediaId', [
    param('mediaId').isInt(),
], isValidInput, async (req, res) => {
    try {
        const media = await Media.findByPk(req.params.mediaId);
        if (media && media.thumbnailPath) {
            if (fs.existsSync(media.thumbnailPath)) {
                const resolvedPath = path.resolve(media.thumbnailPath);
                res.sendFile(resolvedPath);
            } else {
                logError('File path does not exist');
                res.sendStatus(500);
            }
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not get media file thumbnail', err);
        res.sendStatus(500);
    }
});

/**
 * Get list of media info
 */
router.get('/info/list', [
    query('ids').isJSON(),
], isValidInput, async (req, res) => {
    try {
        const media = await Media.findAll({
            where: { id: { [Sequelize.Op.in]: JSON.parse(req.query.ids) } },
        });
        res.status(200).json(media.map((medium) => ({
            mediaid: medium.id,
            filename: medium.fileName,
            creators: medium.creators,
            licenseurl: medium.licenseUrl,
        })));
    } catch (err) {
        logError('Could not get list of media info', err);
        res.sendStatus(500);
    }
});

/**
 * Update media info
 */
router.put('/:mediaId', [
    param('mediaId').isInt(),
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
        body('creators').isArray(),
        body('licenseUrl').isURL().optional({ nullable: true }),
    ]),
], isValidInput, isPermitted(['EDIT_KEY_INFO', 'EDIT_KEY', 'EDIT_GROUP', 'EDIT_COLLECTION']), async (req, res) => {
    try {
        const media = await Media.findByPk(req.params.mediaId);
        if (media) {
            const mediaInfo = await MediaInfo.findAll(
                { where: { mediaId: req.params.mediaId } },
            );
            await media.update({
                creators: req.body.creators,
                licenseUrl: req.body.licenseUrl,
            });
            await handleSetMediaInfo(
                req.params.mediaId,
                mediaInfo,
                req.body.titleNo,
                req.body.titleEn,
            );
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not update media info', err);
        res.sendStatus(500);
    }
});

/**
 * Update revision media info
 */
router.put('/revision/:revisionId', [
    param('revisionId').isUUID(4),
    body('mediaId').isInt(4),
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
        body('creators').isArray(),
        body('licenseUrl').isURL().optional({ nullable: true }),
    ]),
], isValidInput, isPermitted(['EDIT_KEY']), async (req, res) => {
    try {
        const revision = await Revision.findByPk(req.params.revisionId);
        if (revision && revision.media && revision.media.mediaElements) {
            const { media } = revision;
            const mediaElement = media.mediaElements.find((element) => `${element.id}` === `${req.body.mediaId}`);
            if (!media.persons) media.persons = [];
            if (mediaElement) {
                updateMediaElement(req.body, mediaElement, media);
                await Revision.update(
                    { media },
                    { where: { id: req.params.revisionId } },
                );
                res.sendStatus(200);
            } else res.sendStatus(404);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not update revision media info', err);
        res.sendStatus(500);
    }
});

/**
 * Upload media files for entities
 */
router.post(['/key', '/taxon', '/character', '/state', '/group', '/collection'], isPermitted([
    'CREATE_KEY', 'EDIT_KEY_INFO', 'EDIT_KEY', 'CREATE_GROUP', 'EDIT_GROUP', 'CREATE_COLLECTION', 'EDIT_COLLECTION',
]), upload, async (req, res) => {
    try {
        if (req.files && req.files.length > 0) {
            await resizeImages(req.files, 128, 128, 90, 'thumbnail');
            res.sendStatus(200);
        } else res.sendStatus(400);
    } catch (err) {
        logError('Could not create image thumbnails', err);
        res.sendStatus(500);
    }
});

/**
 * Remove media from key and delete files
 */
router.delete('/key/:keyId', [
    param('keyId').isUUID(4),
    body('media').isArray(),
], isValidInput, isPermitted(['CREATE_KEY']), async (req, res) => {
    try {
        const destroyed = await KeyMedia.destroy({
            where: {
                keyId: req.params.keyId,
                mediaId: {
                    [Sequelize.Op.in]: req.body.media.map((media) => media.id),
                },
            },
        });
        if (destroyed === req.body.media.length) {
            await Promise.all(req.body.media.map((media) => deleteMedia(media.id)));
            res.sendStatus(200);
        } else res.sendStatus(500);
    } catch (err) {
        logError('Could not delete files from database or disk', err);
        res.sendStatus(500);
    }
});

/**
 * Remove media from key group and delete files
 */
router.delete('/group/:groupId', [
    param('groupId').isInt(),
    body('media').isArray(),
], isValidInput, isPermitted(['CREATE_GROUP']), async (req, res) => {
    try {
        const destroyed = await GroupMedia.destroy({
            where: {
                groupId: req.params.groupId,
                mediaId: {
                    [Sequelize.Op.in]: req.body.media.map((media) => media.id),
                },
            },
        });
        if (destroyed === req.body.media.length) {
            await Promise.all(req.body.media.map((media) => deleteMedia(media.id)));
            res.sendStatus(200);
        } else res.sendStatus(500);
    } catch (err) {
        logError('Could not delete files from database or disk', err);
        res.sendStatus(500);
    }
});

/**
 * Remove media from collection and delete files
 */
router.delete('/collection/:collectionId', [
    param('collectionId').isInt(),
    body('media').isArray(),
], isValidInput, isPermitted(['CREATE_COLLECTION']), async (req, res) => {
    try {
        const destroyed = await CollectionMedia.destroy({
            where: {
                collectionId: req.params.collectionId,
                mediaId: {
                    [Sequelize.Op.in]: req.body.media.map((media) => media.id),
                },
            },
        });
        if (destroyed === req.body.media.length) {
            await Promise.all(req.body.media.map((media) => deleteMedia(media.id)));
            res.sendStatus(200);
        } else res.sendStatus(500);
    } catch (err) {
        logError('Could not delete files from database or disk', err);
        res.sendStatus(500);
    }
});

/**
 * Remove media from entity in revision
 */
router.delete(['/taxon', '/character', '/state'], [
    body('entityId').isString().isLength({ min: 1 }),
    body('revisionId').isUUID(4),
    body('media').isArray(),
    body('stateId').isString().optional(),
], isValidInput, isPermitted(['EDIT_KEY']), async (req, res) => {
    try {
        const revision = await Revision.findByPk(req.body.revisionId);
        const { content, media } = revision;
        const { taxa, characters } = content;
        removeFromRevision(req.url, req.body, taxa, characters, media);
        await Revision.update({
            content,
            media,
        }, {
            where: { id: req.body.revisionId },
        });
        res.sendStatus(200);
    } catch (err) {
        logError('Could not remove media entity', err);
        res.sendStatus(500);
    }
});

export default router;
