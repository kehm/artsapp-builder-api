import express from 'express';
import { body, param, query } from 'express-validator';
import Sequelize from 'sequelize';
import Collection from '../lib/database/models/Collection.js';
import CollectionInfo from '../lib/database/models/CollectionInfo.js';
import CollectionMedia from '../lib/database/models/CollectionMedia.js';
import Collections from '../lib/database/models/Collections.js';
import Media from '../lib/database/models/Media.js';
import MediaInfo from '../lib/database/models/MediaInfo.js';
import { isAuthenticated, isPermitted } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import {
    createCollectionInfo, getCollectionById, getCollections, updateCollectionInfos,
} from '../utils/collection.js';
import { logError } from '../utils/logger.js';
import { getEntityMedia } from '../utils/media.js';

/**
 * Routes for managing key collections
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get list of collections with collection info
 */
router.get('/', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_COLLECTIONS']), (req, res) => {
    getCollections(req.query.language).then((collections) => {
        const promises = [];
        collections.forEach((element) => {
            promises.push(getEntityMedia(
                'collection_media',
                'collection_id',
                CollectionMedia,
                element.id,
            ));
        });
        Promise.all(promises).then((media) => {
            collections.forEach((element, index) => { element.media = media[index]; });
            res.status(200).json(collections);
        }).catch((err) => {
            logError('Could not query collection media', err);
            res.sendStatus(500);
        });
    }).catch((err) => {
        logError('Could not query collections', err);
        res.sendStatus(500);
    });
});

/**
 * Get collection with collection info by ID
 */
router.get('/:collectionId', [
    param('collectionId').isInt(),
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_COLLECTIONS']), (req, res) => {
    const promises = [];
    promises.push(getCollectionById(req.params.collectionId, req.query.language));
    promises.push(getEntityMedia(
        'collection_media',
        'collection_id',
        CollectionMedia,
        req.params.collectionId,
        req.query.language,
    ));
    Promise.all(promises).then((responses) => {
        const collections = responses[0];
        collections.forEach((element) => { element.media = responses[1]; });
        res.status(200).json(collections);
    }).catch(() => res.status(422).json({ error: 'Invalid argument' }));
});

/**
 * Update collection info
 */
router.put('/:collectionId', [
    param('collectionId').isInt(),
    body('nameNo').isString().isLength({ min: 1 }),
    body('nameEn').isString().isLength({ min: 1 }),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
], isValidInput, isPermitted(['EDIT_COLLECTION']), async (req, res) => {
    try {
        const exists = await CollectionInfo.findAll({
            where: {
                collectionId: { [Sequelize.Op.not]: req.params.collectionId },
                [Sequelize.Op.or]: [
                    {
                        name: req.body.nameNo,
                        languageCode: 'no',
                    },
                    {
                        name: req.body.nameEn,
                        languageCode: 'en',
                    },
                ],
            },
        });
        if (exists.length === 0) {
            const collections = await Collection.findAll({
                include: [{ model: CollectionInfo }],
                where: {
                    id: req.params.collectionId,
                    workgroupId: { [Sequelize.Op.in]: res.locals.workgroups },
                },
            });
            if (collections && collections.length > 0) {
                await updateCollectionInfos(collections, req.params.collectionId, req.body);
                res.sendStatus(200);
            } else res.sendStatus(404);
        } else res.sendStatus(409);
    } catch (err) {
        logError('Could not update collection', err);
        res.sendStatus(500);
    }
});

/**
 * Create new collection
 */
router.post('/', [
    body('nameNo').isString().isLength({ min: 1 }),
    body('nameEn').isString().isLength({ min: 1 }),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('workgroupId').isInt(),
], isValidInput, isPermitted(['CREATE_COLLECTION']), async (req, res) => {
    try {
        if (res.locals.workgroups.includes(parseInt(req.body.workgroupId, 10))) {
            const exists = await CollectionInfo.findAll({
                where: {
                    [Sequelize.Op.or]: [
                        {
                            name: req.body.nameNo,
                            languageCode: 'no',
                        },
                        {
                            name: req.body.nameEn,
                            languageCode: 'en',
                        },
                    ],
                },
            });
            if (exists.length === 0) {
                const collection = await Collection.create({
                    workgroupId: req.body.workgroupId,
                    createdBy: req.user,
                });
                await createCollectionInfo(collection.id, req.body);
                res.status(200).json(collection.id);
            } else res.sendStatus(409);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not create new collection', err);
        res.sendStatus(500);
    }
});

/**
 * Add key to collection
 */
router.post('/key', [
    body('collectionId').isInt(),
    body('keyId').isUUID(4),
], isValidInput, isPermitted(['EDIT_COLLECTION']), async (req, res) => {
    try {
        const collection = await Collection.findByPk(req.body.collectionId);
        if (collection) {
            if (res.locals.workgroups.includes(collection.workgroupId)) {
                await Collections.create({
                    collectionId: req.body.collectionId,
                    keyId: req.body.keyId,
                });
                res.sendStatus(200);
            } else res.sendStatus(403);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not add key to collection', err);
        res.sendStatus(500);
    }
});

/**
 * Delete a collection
 */
router.delete('/:collectionId', [
    param('collectionId').isInt(),
], isValidInput, isPermitted(['CREATE_COLLECTION']), async (req, res) => {
    try {
        const collection = await Collection.findByPk(req.body.collectionId);
        if (collection) {
            if (res.locals.workgroups.includes(collection.workgroupId)) {
                await CollectionInfo.destroy({ where: { collectionId: req.params.collectionId } });
                const collectionMedia = await CollectionMedia.findAll({
                    where: { collectionId: req.params.collectionId },
                });
                if (collectionMedia.length > 0) {
                    await CollectionMedia.destroy({
                        where: { collectionId: req.params.collectionId },
                    });
                    await MediaInfo.destroy({
                        where: {
                            mediaId: {
                                [Sequelize.Op.in]: collectionMedia.map(
                                    (element) => element.mediaId,
                                ),
                            },
                        },
                    });
                    await Media.destroy({
                        where: {
                            id: {
                                [Sequelize.Op.in]: collectionMedia.map(
                                    (element) => element.mediaId,
                                ),
                            },
                        },
                    });
                }
                res.sendStatus(200);
            } else res.sendStatus(403);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not delete collection', err);
        res.sendStatus(500);
    }
});

/**
 * Remove key from collection
 */
router.delete('/key/:collectionsId', [
    param('collectionsId').isInt(),
], isValidInput, isPermitted(['EDIT_COLLECTION']), async (req, res) => {
    try {
        const collection = await Collection.findByPk(req.body.collectionId);
        if (collection) {
            if (res.locals.workgroups.includes(collection.workgroupId)) {
                const destroyed = await Collections.destroy({
                    where: {
                        id: req.params.collectionsId,
                    },
                });
                if (destroyed > 0) {
                    res.sendStatus(200);
                } else res.sendStatus(404);
            } else res.sendStatus(403);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not remove key from collection', err);
        res.sendStatus(500);
    }
});

export default router;
