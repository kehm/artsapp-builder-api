import express from 'express';
import { query, param } from 'express-validator';
import { isAuthenticated, isPermitted } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import { logError } from '../utils/logger.js';
import { getOrganizationById, getOrganizations, getRoleById } from '../utils/organization.js';

/**
 * Routes for managing organizations
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get list of organizations
 */
router.get('/', [
    query('language').isString().optional(),
], isValidInput, isPermitted(['CREATE_KEY', 'EDIT_KEY']), async (req, res) => {
    try {
        const organizations = await getOrganizations(req.query.language);
        res.status(200).json(organizations);
    } catch (err) {
        logError('Could not query organizations', err);
        res.sendStatus(500);
    }
});

/**
 * Get organization by ID
 */
router.get('/:organizationId', [
    param('organizationId').isInt(),
    query('language').isString().optional(),
], isValidInput, async (req, res) => {
    try {
        const organizations = await getOrganizationById(
            req.params.organizationId,
            req.query.language,
        );
        if (organizations.length > 0) {
            res.status(200).json(organizations[0]);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not query organizations', err);
        res.sendStatus(500);
    }
});

/**
 * Get role by ID
 */
router.get('/roles/:roleId', [
    param('roleId').isInt(),
    query('language').isString().optional(),
], isValidInput, async (req, res) => {
    try {
        const roles = await getRoleById(req.params.roleId, req.query.language);
        if (roles.length > 0) {
            res.status(200).json(roles[0]);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not get roles', err);
        res.sendStatus(500);
    }
});

export default router;
