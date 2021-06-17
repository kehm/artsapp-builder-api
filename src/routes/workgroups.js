import express from 'express';
import { body, param, query } from 'express-validator';
import Sequelize from 'sequelize';
import User from '../lib/database/models/User.js';
import Workgroup from '../lib/database/models/Workgroup.js';
import Workgroups from '../lib/database/models/Workgroups.js';
import { isAuthenticated, isPermitted } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import { logError } from '../utils/logger.js';

/**
 * Routes for managing key groups
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get workgroups for organization
 */
router.get('/', isPermitted(['BROWSE_WORKGROUPS']), async (req, res) => {
    try {
        const workgroups = await Workgroup.findAll({
            attributes: ['id', 'name', 'organizationId'],
            where: { organizationId: res.locals.organizationId },
        });
        res.status(200).json(workgroups);
    } catch (err) {
        logError('Could not get workgroups for organization', err);
        res.sendStatus(500);
    }
});

/**
 * Get workgroups for user in session
 */
router.get('/user/session', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['BROWSE_WORKGROUPS']), async (req, res) => {
    try {
        const workgroups = await Workgroups.findAll({
            attributes: {
                exclude: ['artsapp_user_id', 'userId'],
            },
            include: [{ model: Workgroup }],
            where: {
                userId: req.user,
            },
        });
        res.status(200).json(workgroups.map((element) => element.workgroup));
    } catch (err) {
        logError('Could not get workgroups for user', err);
        res.sendStatus(500);
    }
});

/**
 * Get workgroup members
 */
router.get('/users/:workgroupId', [
    param('workgroupId').isInt(),
], isValidInput, isPermitted(['EDIT_WORKGROUP']), async (req, res) => {
    try {
        if (res.locals.workgroups.includes(parseInt(req.params.workgroupId, 10))) {
            const workgroups = await Workgroups.findAll({
                attributes: {
                    exclude: ['artsapp_user_id', 'userId', 'workgroup_id'],
                },
                include: [{
                    model: User,
                    attributes: ['name', 'roleId', 'organizationId'],
                }],
                where: {
                    workgroupId: req.params.workgroupId,
                    userId: { [Sequelize.Op.not]: req.user },
                },
            });
            res.status(200).json(workgroups);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not get workgroups for user', err);
        res.sendStatus(500);
    }
});

/**
 * Update workgroup
 */
router.put('/:workgroupId', [
    param('workgroupId').isInt(),
    body('name').isString().isLength({ min: 1 }),
], isValidInput, isPermitted(['EDIT_WORKGROUP']), async (req, res) => {
    try {
        if (res.locals.workgroups.includes(parseInt(req.params.workgroupId, 10))) {
            const workgroup = await Workgroup.findByPk(req.params.workgroupId);
            if (workgroup) {
                try {
                    await workgroup.update({ name: req.body.name });
                    res.sendStatus(200);
                } catch (err) {
                    res.sendStatus(409);
                }
            } else res.sendStatus(404);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not update workgroup', err);
        res.sendStatus(500);
    }
});

/**
 * Create new workgroup
 */
router.post('/', [
    body('name').isString().isLength({ min: 1 }),
], isValidInput, isPermitted(['CREATE_WORKGROUP']), async (req, res) => {
    try {
        try {
            const workgroup = await Workgroup.create({
                name: req.body.name,
                organizationId: res.locals.organizationId,
                createdBy: req.user,
            });
            await Workgroups.create({
                workgroupId: workgroup.id,
                userId: req.user,
            });
            res.status(200).json(workgroup.id);
        } catch (err) {
            res.sendStatus(409);
        }
    } catch (err) {
        logError('Could not create workgroup', err);
        res.sendStatus(500);
    }
});

/**
 * Add user to workgroup
 */
router.post('/users', [
    body('email').isString().isLength({ min: 1 }),
    body('workgroupId').isInt(),
], isValidInput, isPermitted(['EDIT_WORKGROUP']), async (req, res) => {
    try {
        if (res.locals.workgroups.includes(parseInt(req.body.workgroupId, 10))) {
            const user = await User.findOne({
                where: {
                    email: { [Sequelize.Op.iLike]: req.body.email },
                },
            });
            if (user && user.id !== req.user) {
                const workgroup = await Workgroup.findOne({
                    where: {
                        id: req.body.workgroupId,
                        organizationId: user.organizationId,
                    },
                });
                if (workgroup) {
                    const defaults = {
                        userId: user.id,
                        workgroupId: req.body.workgroupId,
                    };
                    await Workgroups.findOrCreate({
                        where: defaults,
                        defaults,
                    });
                    res.sendStatus(200);
                } else res.sendStatus(404);
            } else res.sendStatus(404);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not add user to workgroup', err);
        res.sendStatus(500);
    }
});

/**
 * Delete a workgroup
 */
router.delete('/:workgroupId', [
    param('workgroupId').isInt(),
], isValidInput, isPermitted(['CREATE_WORKGROUP']), async (req, res) => {
    try {
        const destroyed = await Workgroup.destroy({
            where: {
                id: req.params.workgroupId,
                organizationId: res.locals.organizationId,
            },
        });
        if (destroyed > 0) {
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not delete workgroup', err);
        res.sendStatus(500);
    }
});

/**
 * Remove user in session from the workgroup
 */
router.delete('/user/session/:workgroupsId', [
    param('workgroupsId').isInt(),
], isValidInput, isPermitted(['BROWSE_WORKGROUPS']), async (req, res) => {
    try {
        const destroyed = await Workgroups.destroy({
            where: {
                id: req.params.workgroupsId,
                userId: req.user,
            },
        });
        if (destroyed > 0) {
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not remove user from workgroup', err);
        res.sendStatus(500);
    }
});

/**
 * Remove a user's workgroup association
 */
router.delete('/users/:workgroupsId', [
    param('workgroupsId').isInt(),
], isValidInput, isPermitted(['EDIT_WORKGROUP']), async (req, res) => {
    try {
        const destroyed = await Workgroups.destroy({
            where: {
                id: req.params.workgroupsId,
            },
        });
        if (destroyed > 0) {
            res.sendStatus(200);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not remove user from workgroup', err);
        res.sendStatus(500);
    }
});

export default router;
