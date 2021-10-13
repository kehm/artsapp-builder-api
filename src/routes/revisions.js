import express from 'express';
import { body, param } from 'express-validator';
import Sequelize from 'sequelize';
import Key from '../lib/database/models/Key.js';
import Revision from '../lib/database/models/Revision.js';
import Revisions from '../lib/database/models/Revisions.js';
import { isAuthenticated, isPermitted, isPermittedKey } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import { logError } from '../utils/logger.js';
import { createRevision, findRevisionForKey } from '../utils/revision.js';

/**
 * Routes for the key builder
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get key revision by ID
 */
router.get('/:revisionId', [
    param('revisionId').isUUID(4),
], isValidInput, isPermitted(['BROWSE_KEYS']), async (req, res) => {
    try {
        const revision = await Revision.findByPk(req.params.revisionId, { attributes: { exclude: ['created_by'] } });
        if (revision) {
            const keyRevision = await Revisions.findOne({
                where: { revisionId: req.params.revisionId },
            });
            if (keyRevision) {
                const rev = revision.get({ plain: true });
                rev.keyId = keyRevision.keyId;
                res.status(200).json(rev);
            } else res.status(500).json({ error: 'Revision is not associated with a key' });
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not get key revision', err);
        res.sendStatus(500);
    }
});

/**
 * Get list of key revisions for key
 */
router.get('/key/:keyId', [
    param('keyId').isUUID(4),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const keyRevisions = await Revisions.findAll({
            where: { keyId: req.params.keyId },
        });
        if (keyRevisions && keyRevisions.length > 0) {
            const revisions = await Revision.findAll({
                attributes: {
                    exclude: ['created_by'],
                },
                order: [['created_at', 'DESC']],
                where: {
                    id: {
                        [Sequelize.Op.in]: keyRevisions.map(
                            (keyRevision) => keyRevision.revisionId,
                        ),
                    },
                },
            });
            revisions.forEach((element) => {
                if (element.createdBy === req.user) {
                    element.createdBy = true;
                } else element.createdBy = false;
            });
            res.status(200).json(revisions);
        } else res.status(200).json([]);
    } catch (err) {
        logError('Could not get list of key revisions for key', err);
        res.sendStatus(500);
    }
});

/**
 * Update revision status
 */
router.put('/status/:revisionId', [
    param('revisionId').isUUID(4),
    body('keyId').isUUID(4),
    body('status').custom((value) => {
        if (!['DRAFT', 'REVIEW', 'ACCEPTED'].some((element) => element === value)) throw new Error('Invalid value');
        return true;
    }),
], isValidInput, isPermittedKey('PUBLISH_KEY'), async (req, res) => {
    try {
        const { revision, key } = await findRevisionForKey(req.params.revisionId, req.body.keyId);
        if (revision && key && key.revisionId !== req.params.revisionId) {
            await Revision.update(
                { status: req.body.status },
                {
                    where: { id: req.params.revisionId },
                },
            );
            res.sendStatus(200);
        } else res.sendStatus(409);
    } catch (err) {
        logError('Could not update revision status', err);
        res.sendStatus(500);
    }
});

/**
 * Change key mode
 */
router.put('/mode/:revisionId', [
    param('revisionId').isUUID(4),
    body('keyId').isUUID(4),
    body('mode').isInt({ min: 1, max: 2 }),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const { revision, key } = await findRevisionForKey(req.params.revisionId, req.body.keyId);
        if (key && revision) {
            const revisionId = await createRevision(
                key,
                revision.content,
                revision.media,
                req.user,
                `Changed key mode to ${req.body.mode === 1 ? 'simple' : 'advanced'}`,
                req.body.mode,
            );
            res.status(200).json(revisionId);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not change key mode', err);
        res.sendStatus(500);
    }
});

/**
 * Create new revision (if key does not already have a revision, set this revision as default)
 */
router.post('/', [
    body('keyId').isUUID(4),
    body('content').isJSON().optional(),
    body('media').isJSON().optional(),
    body('note').isString().optional(),
    body('mode').isInt({ min: 1, max: 2 }).optional(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const key = await Key.findByPk(req.body.keyId);
        if (key) {
            const revisionId = await createRevision(
                key,
                req.body.content ? JSON.parse(req.body.content) : {},
                req.body.media ? JSON.parse(req.body.media) : {},
                req.user,
                req.body.note,
                req.body.mode,
            );
            res.status(200).json(revisionId);
        } else res.sendStatus(400);
    } catch (err) {
        logError('Could not create new revision', err);
        res.sendStatus(500);
    }
});

export default router;
