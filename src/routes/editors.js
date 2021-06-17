import express from 'express';
import { body, param } from 'express-validator';
import Sequelize from 'sequelize';
import Editors from '../lib/database/models/Editors.js';
import User from '../lib/database/models/User.js';
import { isAuthenticated, isPermittedKey } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import { logError } from '../utils/logger.js';

/**
 * Routes for managing users, roles and ownership
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get key editors
 */
router.get('/key/:keyId', [
    param('keyId').isString().isLength({ min: 1 }),
], isValidInput, isPermittedKey('SHARE_KEY'), async (req, res) => {
    try {
        const editors = await Editors.findAll({
            attributes: {
                exclude: ['artsapp_user_id', 'userId', 'artsapp_key_id'],
            },
            include: [{
                model: User,
                attributes: ['name', 'roleId', 'organizationId'],
            }],
            where: {
                keyId: req.params.keyId,
                userId: { [Sequelize.Op.not]: req.user },
            },
        });
        res.status(200).json(editors);
    } catch (err) {
        logError('Could not get key editors', err);
        res.sendStatus(500);
    }
});

/**
 * Make user an editor of the key
 */
router.post('/', [
    body('keyId').isUUID(4),
    body('email').isString().isLength({ min: 1 }),
], isValidInput, isPermittedKey('SHARE_KEY'), async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                email: { [Sequelize.Op.iLike]: req.body.email },
            },
        });
        if (user && user.id !== req.user) {
            const defaults = {
                keyId: req.body.keyId,
                userId: user.id,
            };
            await Editors.findOrCreate({
                where: defaults,
                defaults,
            });
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not add key editor', err);
        res.sendStatus(500);
    }
});

/**
 * Remove key editor
 */
router.delete('/:editorsId', [
    body('keyId').isUUID(4),
    param('editorsId').isInt(),
], isValidInput, isPermittedKey('SHARE_KEY'), async (req, res) => {
    try {
        const destroyed = await Editors.destroy({ where: { id: req.params.editorsId } });
        if (destroyed > 0) {
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not remove editor', err);
        res.sendStatus(500);
    }
});

export default router;
