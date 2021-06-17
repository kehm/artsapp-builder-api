import express from 'express';
import { body, param, query } from 'express-validator';
import Sequelize from 'sequelize';
import Group from '../lib/database/models/Group.js';
import GroupInfo from '../lib/database/models/GroupInfo.js';
import GroupMedia from '../lib/database/models/GroupMedia.js';
import {
    createGroupInfo,
    getKeyGroupById, getKeyGroups, updateGroupInfos, updateGroupParents,
} from '../utils/group.js';
import { logError } from '../utils/logger.js';
import { getEntityMedia } from '../utils/media.js';
import Media from '../lib/database/models/Media.js';
import MediaInfo from '../lib/database/models/MediaInfo.js';
import { isAuthenticated, isPermitted } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';

/**
 * Routes for managing key groups
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get list of key groups with key group info, media and parents
 */
router.get('/', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_GROUPS']), (req, res) => {
    getKeyGroups(req.query.language).then((groups) => {
        const promises = [];
        groups.forEach((group) => {
            promises.push(getEntityMedia(
                'key_group_media',
                'key_group_id',
                GroupMedia,
                group.id,
            ));
        });
        Promise.all(promises).then((media) => {
            groups.forEach((group, index) => { group.media = media[index]; });
            res.status(200).json(groups);
        }).catch((err) => {
            logError('Could not query key group media', err);
            res.sendStatus(500);
        });
    }).catch((err) => {
        logError('Could not query key groups', err);
        res.sendStatus(500);
    });
});

/**
 * Get key group with key group info and parents by ID
 */
router.get('/:groupId', [
    param('groupId').isInt(),
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_GROUPS']), (req, res) => {
    const promises = [];
    promises.push(getKeyGroupById(req.params.groupId, req.query.language));
    promises.push(getEntityMedia(
        'key_group_media',
        'key_group_id',
        GroupMedia,
        req.params.groupId,
        req.query.language,
    ));
    Promise.all(promises).then((responses) => {
        const groups = responses[0];
        groups.forEach((group) => { group.media = responses[1]; });
        res.status(200).json(groups);
    }).catch(() => res.status(422).json({ error: 'Invalid argument' }));
});

/**
 * Update key group info
 */
router.put('/:groupId', [
    param('groupId').isInt(),
    body('nameNo').isString().isLength({ min: 1 }),
    body('nameEn').isString().isLength({ min: 1 }),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('parentId').isInt().optional(),
], isValidInput, isPermitted(['EDIT_GROUP']), async (req, res) => {
    try {
        const exists = await GroupInfo.findAll({
            where: {
                groupId: { [Sequelize.Op.not]: req.params.groupId },
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
            const groups = await Group.findAll({
                include: [{ model: GroupInfo }],
                where: { id: req.params.groupId },
            });
            if (groups && groups.length > 0) {
                await updateGroupInfos(groups, req.params.groupId, req.body);
                if (req.body.parentId !== undefined) {
                    await updateGroupParents(req.params.groupId, req.body.parentId);
                }
                res.sendStatus(200);
            } else res.sendStatus(404);
        } else res.sendStatus(409);
    } catch (err) {
        logError('Could not update key group', err);
        res.sendStatus(500);
    }
});

/**
 * Create new key group
 */
router.post('/', [
    body('nameNo').isString().isLength({ min: 1 }),
    body('nameEn').isString().isLength({ min: 1 }),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('parentId').isInt().optional(),
], isValidInput, isPermitted(['CREATE_GROUP']), async (req, res) => {
    try {
        const exists = await GroupInfo.findAll({
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
            const group = await Group.create({ createdBy: req.user });
            await createGroupInfo(group.id, req.body);
            res.status(200).json(group.id);
        } else res.sendStatus(409);
    } catch (err) {
        logError('Could not create new key group', err);
        res.sendStatus(500);
    }
});

/**
 * Delete a key group (including info and media)
 */
router.delete('/:groupId', [
    param('groupId').isInt(),
], isValidInput, isPermitted(['CREATE_GROUP']), async (req, res) => {
    try {
        await GroupInfo.destroy({ where: { groupId: req.params.groupId } });
        const groupMedia = await GroupMedia.findAll({ where: { groupId: req.params.groupId } });
        if (groupMedia.length > 0) {
            await GroupMedia.destroy({ where: { groupId: req.params.groupId } });
            await MediaInfo.destroy({
                where: {
                    mediaId: {
                        [Sequelize.Op.in]: groupMedia.map((element) => element.mediaId),
                    },
                },
            });
            await Media.destroy({
                where: {
                    id: {
                        [Sequelize.Op.in]: groupMedia.map((element) => element.mediaId),
                    },
                },
            });
        }
        res.sendStatus(200);
    } catch (err) {
        logError('Could not delete key group', err);
        res.sendStatus(500);
    }
});

export default router;
