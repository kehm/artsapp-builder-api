import express from 'express';
import { body, param, query } from 'express-validator';
import axios from 'axios';
import Taxon from '../lib/database/models/Taxon.js';
import { logError } from '../utils/logger.js';
import { createRevision, findRevisionForKey } from '../utils/revision.js';
import {
    findTaxonById, addToParent, findTaxonByName, modifyTaxonNames, updateParentTaxon, setTaxonInfo,
} from '../utils/taxon.js';
import { isAuthenticated, isPermitted, isPermittedKey } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';

/**
 * Routes for characters
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Get scientific name suggestions for taxon
 */
router.get('/scientificname/suggest', [
    query('scientificname').isString().isLength({ min: 1 }),
], isValidInput, isPermitted(['EDIT_KEY']), async (req, res) => {
    try {
        const response = await axios.get(
            `${process.env.ADB_API_URL}/Taxon/ScientificName/Suggest?scientificname=${req.query.scientificname}`,
            { timeout: parseInt(process.env.HTTP_TIMEOUT, 10) },
        );
        res.status(200).json(response.data);
    } catch (err) {
        logError('Could not get scientific name suggestion for taxon', err);
        res.sendStatus(500);
    }
});

/**
 * Get vernacular name for taxon
 */
router.get('/scientificname/vernacularname', [
    query('scientificname').isString().isLength({ min: 1 }),
], isValidInput, isPermitted(['EDIT_KEY']), async (req, res) => {
    try {
        const responseSN = await axios.get(
            `${process.env.ADB_API_URL}/Taxon/ScientificName?Scientificname=${req.query.scientificname}`,
            { timeout: parseInt(process.env.HTTP_TIMEOUT, 10) },
        );
        if (responseSN.data.length > 0 && responseSN.data[0].taxonID) {
            const responseVN = await axios.get(
                `${process.env.ADB_API_URL}/Taxon/${responseSN.data[0].taxonID}`,
                { timeout: parseInt(process.env.HTTP_TIMEOUT, 10) },
            );
            if (responseVN.data.PreferredVernacularName
                && responseVN.data.PreferredVernacularName.vernacularName) {
                res.status(200).json(responseVN.data.PreferredVernacularName.vernacularName);
            } else res.sendStatus(204);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not get vernacular name for taxon', err);
        res.sendStatus(500);
    }
});

/**
 * Update taxon
 */
router.put('/:taxonId', [
    body('keyId').isUUID(4),
    param('taxonId').isString(),
    body('revisionId').isUUID(4),
    body('scientificName').isString().isLength({ min: 1 }),
    body('vernacularNameNo').isString().optional(),
    body('vernacularNameNo').isString().optional(),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('parentId').isInt().optional(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const { revision, key } = await findRevisionForKey(req.body.revisionId, req.body.keyId);
        if (key && revision) {
            const taxon = await Taxon.findByPk(req.params.taxonId);
            if (taxon) {
                const { content } = revision;
                if (content.taxa) {
                    const tmpTaxon = findTaxonById(content.taxa, `${taxon.id}`, true);
                    if (tmpTaxon) {
                        const valid = modifyTaxonNames(
                            tmpTaxon,
                            `${taxon.id}`,
                            content.taxa,
                            req.body,
                        );
                        if (req.body.parentId !== undefined) {
                            if (req.body.parentId !== tmpTaxon.parentId && content.statements) {
                                content.statements = content.statements.filter(
                                    (element) => element.taxonId !== tmpTaxon.id,
                                );
                            }
                            updateParentTaxon(
                                tmpTaxon,
                                parseInt(req.body.parentId, 10),
                                content.taxa,
                                taxon.id,
                            );
                        }
                        delete tmpTaxon.parentId;
                        if (valid) {
                            const revisionId = await createRevision(
                                key,
                                content,
                                revision.media,
                                req.user,
                                `Updated taxon: ${req.body.scientificName}`,
                                revision.mode,
                            );
                            res.status(200).json(revisionId);
                        } else res.sendStatus(409);
                    } else res.sendStatus(404);
                } else res.sendStatus(404);
            } else res.sendStatus(404);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not update taxon', err);
        res.sendStatus(500);
    }
});

/**
 * Create new taxon for key
 */
router.post('/', [
    body('keyId').isUUID(4),
    body('revisionId').isUUID(4),
    body('scientificName').isString(),
    body('vernacularNameNo').isString().optional(),
    body('vernacularNameEn').isString().optional(),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('parentId').isInt().optional(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const { revision, key } = await findRevisionForKey(req.body.revisionId, req.body.keyId);
        if (key && revision) {
            const { content } = revision;
            if (!content.taxa) content.taxa = [];
            if (!findTaxonByName(content.taxa, req.body.scientificName)) {
                const { vernacularName, description } = setTaxonInfo(req.body);
                const taxon = await Taxon.create({ keyId: req.body.keyId });
                const newTaxon = {
                    id: `${taxon.id}`,
                    scientificName: req.body.scientificName,
                    vernacularName,
                    description,
                };
                if (req.body.parentId) {
                    addToParent(content.taxa, newTaxon, req.body.parentId);
                } else content.taxa.push(newTaxon);
                const revisionId = await createRevision(
                    key,
                    content,
                    revision.media,
                    req.user,
                    `Created new taxon: ${req.body.scientificName}`,
                    revision.mode,
                );
                res.status(200).json({ revisionId, taxonId: `${taxon.id}` });
            } else res.sendStatus(409);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not create new taxon for key', err);
        res.sendStatus(500);
    }
});

export default router;
