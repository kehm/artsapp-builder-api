import express from 'express';
import authRoute from './auth.js';
import keysRoute from './keys.js';
import revisionsRoute from './revisions.js';
import charactersRoute from './characters.js';
import taxaRoute from './taxa.js';
import groupsRoute from './groups.js';
import collectionsRoute from './collections.js';
import mediaRoute from './media.js';
import editorsRoute from './editors.js';
import organizationsRoute from './organizations.js';
import workgroupsRoute from './workgroups.js';

/**
 * Base route
 */
const router = express.Router();

router.use('/auth', authRoute);
router.use('/keys', keysRoute);
router.use('/revisions', revisionsRoute);
router.use('/characters', charactersRoute);
router.use('/taxa', taxaRoute);
router.use('/groups', groupsRoute);
router.use('/collections', collectionsRoute);
router.use('/media', mediaRoute);
router.use('/editors', editorsRoute);
router.use('/organizations', organizationsRoute);
router.use('/workgroups', workgroupsRoute);

export default router;
