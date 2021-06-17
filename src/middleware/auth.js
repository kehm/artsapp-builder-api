import Editors from '../lib/database/models/Editors';
import Key from '../lib/database/models/Key';
import User from '../lib/database/models/User';
import { getUserPermissions } from '../utils/auth';
import { logError } from '../utils/logger';

/**
 * Check if a valid session exists
 */
export const isAuthenticated = (req, res, next) => {
    if (req.user) {
        next();
    } else res.sendStatus(403);
};

/**
 * Check if user is permitted to perform some action for his/her organization
 *
 * @param {Array} permission Required permission types
 */
export const isPermitted = (permission) => async (req, res, next) => {
    try {
        if (req.user) {
            const permissions = await getUserPermissions(req.user, permission);
            if (permissions && permissions.length > 0) {
                res.locals.permission = permission[0];
                res.locals.permissions = permissions.map((element) => element.permission_name);
                res.locals.organizationId = permissions[0].organization_id;
                res.locals.workgroups = permissions.map((element) => element.workgroup_id);
                next();
            } else res.sendStatus(403);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not get key permissions', err);
        res.sendStatus(500);
    }
};

/**
 * Check if the user is permitted to perform some action on the key
 *
 * @param {string} permission Required permission type
 */
export const isPermittedKey = (permission) => async (req, res, next) => {
    try {
        if (req.user) {
            const user = await User.findByPk(req.user);
            const permissions = await getUserPermissions(req.user, [permission]);
            res.locals.permission = permission;
            res.locals.permissions = permissions.map((element) => element.permission_name);
            res.locals.organizationId = user.organization_id;
            res.locals.workgroups = permissions.map((element) => element.workgroup_id);
            const permissionsSet = new Set(res.locals.permissions);
            const workgroups = res.locals.workgroups;
            workgroups.push(null);
            const keys = await Key.findAll({
                where: { id: req.params.keyId || req.body.keyId },
            });
            if (keys.length > 0) {
                if (keys[0].createdBy === req.user) {
                    permissionsSet.add('PUBLISH_KEY');
                    permissionsSet.add('SHARE_KEY');
                    permissionsSet.add('EDIT_KEY');
                    permissionsSet.add('EDIT_KEY_INFO');
                } else if (keys[0].workgroupId === null
                    || !res.locals.workgroups.includes(keys[0].workgroupId)) {
                    permissionsSet.clear();
                }
            } else permissionsSet.clear();
            const editors = await Editors.findAll({
                where: {
                    keyId: req.params.keyId || req.body.keyId,
                    userId: req.user,
                },
            });
            if (editors.length > 0) permissionsSet.add('EDIT_KEY');
            const arr = Array.from(permissionsSet);
            if (arr.includes(res.locals.permission)) {
                res.locals.permissions = arr;
                next();
            } else res.sendStatus(403);
        } else res.sendStatus(403);
    } catch (err) {
        logError('Could not get key permissions', err);
        res.sendStatus(500);
    }
};
