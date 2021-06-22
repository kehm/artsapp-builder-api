import express from 'express';
import {
    body, oneOf, param, query,
} from 'express-validator';
import Sequelize from 'sequelize';
import Collections from '../lib/database/models/Collections.js';
import Key from '../lib/database/models/Key.js';
import KeyInfo from '../lib/database/models/KeyInfo.js';
import { isAuthenticated, isPermitted, isPermittedKey } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import {
    createKeyMetadata, getKey, getKeys, handleSetKeyInfo,
    handleSetKeyLanguages, handleSetKeyPublishers, handleUpdateKey, isKeyEditor, updateCollections,
} from '../utils/key.js';
import { logError } from '../utils/logger.js';

/**
 * Routes for the key builder
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get all keys
 */
router.get('/', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_KEYS']), async (req, res) => {
    try {
        const keys = await getKeys(req.user, req.query.language);
        res.status(200).json(keys);
    } catch (err) {
        logError('Could not get keys', err);
        res.sendStatus(500);
    }
});

/**
 * Get key by ID
 */
router.get('/:keyId', [
    param('keyId').isUUID(4),
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_KEYS']), async (req, res) => {
    try {
        const responses = await getKey(req.params.keyId, req.query.language);
        const keys = responses[0];
        const keyInfo = [];
        keys.forEach((element) => keyInfo.push(element.key_info));
        const key = keys[0].get({ plain: true });
        key.key_info = keyInfo;
        if (key.createdBy === req.user) {
            key.createdBy = true;
        } else key.createdBy = false;
        key.isEditor = await isKeyEditor(req.params.keyId, req.user);
        [key.languages, key.publishers, key.media, key.collections] = responses.slice(1);
        res.status(200).json(key);
    } catch (err) {
        res.sendStatus(404);
    }
});

/**
 * Get keys created by user
 */
router.get('/user/session', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_KEYS']), async (req, res) => {
    try {
        const keys = await getKeys(req.user, req.query.language, true);
        res.status(200).json(keys);
    } catch (err) {
        logError('Could not get keys for user', err);
        res.sendStatus(500);
    }
});

/**
 * Get keys by key group ID
 */
router.get('/group/:groupId', [
    param('groupId').isInt(),
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_GROUPS']), async (req, res) => {
    try {
        const keys = await Key.findAll({
            attributes: ['id', 'keyGroupId'],
            include: [
                {
                    model: KeyInfo,
                    where: req.query.language ? { languageCode: req.query.language } : {},
                    attributes: ['languageCode', 'title'],
                },
            ],
            where: {
                keyGroupId: req.params.groupId,
                status: { [Sequelize.Op.not]: 'HIDDEN' },
            },
        });
        res.status(200).json(keys);
    } catch (err) {
        logError('Could not get key', err);
        res.sendStatus(500);
    }
});

/**
 * Get keys by collection ID
 */
router.get('/collection/:collectionId', [
    param('collectionId').isInt(),
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_COLLECTIONS']), async (req, res) => {
    try {
        const keys = await Collections.findAll({
            attributes: ['id', 'collectionId'],
            include: [
                {
                    model: Key,
                    attributes: ['id'],
                    include: {
                        model: KeyInfo,
                        where: req.query.language ? { languageCode: req.query.language } : {},
                        attributes: ['languageCode', 'title'],
                    },
                },
            ],
            where: { collectionId: req.params.collectionId },
        });
        res.status(200).json(keys);
    } catch (err) {
        logError('Could not get key', err);
        res.sendStatus(500);
    }
});

/**
 * Update key
 */
router.put('/:keyId', [
    param('keyId').isUUID(4),
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
    ]),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('version').isString().optional(),
    body('status').custom((value) => {
        if (!['PRIVATE', 'BETA', 'PUBLISHED'].some((element) => element === value)) throw new Error('Invalid value');
        return true;
    }),
    body('groupId').isInt().optional(),
    body('collections').isArray().optional(),
    body('workgroupId').isInt().optional(),
    body('licenseUrl').isURL().optional(),
    body('revisionId').isUUID(4),
    body('languages').isArray(),
    body('creators').isArray(),
    body('contributors').isArray(),
    body('publishers').isArray(),
], isValidInput, isPermittedKey('EDIT_KEY_INFO'), async (req, res) => {
    try {
        if (req.body.status !== 'PRIVATE' || res.locals.permissions.includes('PUBLISH_KEY')) {
            const keys = await Key.findAll({
                include: [{ model: KeyInfo }],
                where: {
                    id: req.params.keyId,
                    status: { [Sequelize.Op.not]: 'HIDDEN' },
                },
            });
            if (keys && keys.length > 0) {
                const promises = [];
                promises.push(handleSetKeyLanguages(req.params.keyId, req.body.languages));
                promises.push(handleSetKeyPublishers(req.params.keyId, req.body.publishers));
                promises.push(handleUpdateKey(req.params.keyId, req.body));
                promises.push(handleSetKeyInfo(req.params.keyId, keys, req.body));
                promises.push(updateCollections(req.params.keyId, req.body.collections));
                await Promise.all(promises);
                res.sendStatus(200);
            } else res.sendStatus(404);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not update key or key info', err);
        res.sendStatus(500);
    }
});

/**
 * Set key status to HIDDEN
 */
router.put('/hide/:keyId', [
    param('keyId').isUUID(4),
], isValidInput, isPermitted(['EDIT_KEY_INFO']), async (req, res) => {
    try {
        await Key.update(
            { status: 'HIDDEN' },
            {
                where: {
                    id: req.params.keyId,
                    createdBy: req.user,
                },
            },
        );
        res.sendStatus(200);
    } catch (err) {
        logError('Could not hide key', err);
        res.sendStatus(500);
    }
});

/**
 * Create new key
 */
router.post('/', [
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
    ]),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('groupId').isInt().optional(),
    body('collections').isArray().optional(),
    body('workgroupId').isInt().optional(),
    body('languages').isArray(),
], isValidInput, isPermitted(['CREATE_KEY']), async (req, res) => {
    try {
        if (!req.body.workgroupId
            || res.locals.workgroups.includes(parseInt(req.body.workgroupId, 10))) {
            const key = await Key.create({
                keyGroupId: req.body.groupId,
                workgroupId: req.body.workgroupId ? req.body.workgroupId : null,
                createdBy: req.user,
                status: 'PRIVATE',
            });
            await createKeyMetadata(key.id, req.body);
            res.status(200).json(key.id);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not create new key', err);
        res.sendStatus(500);
    }
});

export default router;
