import express from 'express';
import { body, oneOf, param } from 'express-validator';
import Character from '../lib/database/models/Character.js';
import CharacterState from '../lib/database/models/CharacterState.js';
import Key from '../lib/database/models/Key.js';
import Revision from '../lib/database/models/Revision.js';
import { isAuthenticated, isPermittedKey } from '../middleware/auth.js';
import isValidInput from '../middleware/input.js';
import {
    createMultiStates, createNumericalState, removeStatePremises,
    checkMinMaxValues, setCharacterInfo,
} from '../utils/character.js';
import { logError } from '../utils/logger.js';
import { createRevision, findRevisionForKey } from '../utils/revision.js';

/**
 * Routes for characters
 */
const router = express.Router();
router.use(isAuthenticated);

/**
 * Update character premise
 */
router.put('/premise/:characterId', [
    param('characterId').isString(),
    body('keyId').isUUID(4),
    body('revisionId').isUUID(4),
    body('logicalPremise').isArray(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const key = await Key.findByPk(req.body.keyId);
        if (key) {
            const character = await Character.findByPk(req.params.characterId);
            if (character) {
                const revision = await findRevisionForKey(req.body.revisionId, req.body.keyId);
                if (revision.content.characters) {
                    const char = revision.content.characters.find(
                        (element) => element.id === req.params.characterId,
                    );
                    char.logicalPremise = req.body.logicalPremise;
                    const revisionId = await createRevision(
                        key,
                        revision.content,
                        revision.media,
                        req.user,
                        `Updated character premise: ${char.title.en || char.title.no}`,
                    );
                    res.status(200).json(revisionId);
                } else res.sendStatus(404);
            } else res.sendStatus(404);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not update character premise', err);
        res.sendStatus(500);
    }
});

/**
 * Remove values that include the listed state IDs from the affected character premises
 */
router.put('/states/revision/:revisionId', [
    param('revisionId').isUUID(4),
    body('keyId').isUUID(4),
    body('states').isArray(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const key = await Key.findByPk(req.body.keyId);
        if (key) {
            const revision = await Revision.findByPk(req.params.revisionId);
            if (revision && revision.content.characters) {
                const { content } = revision;
                req.body.states.forEach((state) => {
                    content.characters = removeStatePremises(state, content.characters);
                });
                await Revision.update(
                    { content },
                    { where: { id: req.params.revisionId } },
                );
                res.sendStatus(200);
            } else res.sendStatus(404);
        } else res.sendStatus(404);
    } catch (err) {
        logError('Could not update character premise', err);
        res.sendStatus(500);
    }
});

/**
 * Update character
 */
router.put('/:characterId', [
    body('keyId').isUUID(4),
    param('characterId').isString(),
    body('revisionId').isUUID(4),
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
    ]),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    oneOf([
        body('alternatives').isArray(),
        [
            body('unitNo').isString().optional(),
            body('unitEn').isString().optional(),
            body('min').isFloat(),
            body('max').isFloat(),
            body('stepSize').isFloat(),
        ],
    ]),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        if ((req.body.type === 'NUMERICAL' && (req.body.unitNo || req.body.unitEn))
            || ((req.body.type === 'EXCLUSIVE' || req.body.type === 'MULTISTATE') && req.body.alternatives && req.body.alternatives.length > 1)) {
            const key = await Key.findByPk(req.body.keyId);
            if (key) {
                let states;
                const character = await Character.findByPk(req.params.characterId);
                if (character) {
                    const revision = await findRevisionForKey(
                        req.body.revisionId,
                        req.body.keyId,
                    );
                    if (revision.content.characters) {
                        let char = revision.content.characters.find(
                            (element) => element.id === req.params.characterId,
                        );
                        char = setCharacterInfo(char, req.body);
                        if (char.type.toUpperCase() === 'EXCLUSIVE' || char.type.toUpperCase() === 'MULTISTATE') {
                            states = await createMultiStates(char, req.body.alternatives);
                        } else {
                            const unit = {};
                            if (req.body.unitNo) unit.no = req.body.unitNo;
                            if (req.body.unitEn) unit.en = req.body.unitEn;
                            states = await createNumericalState(
                                char.id,
                                unit,
                                req.body.min,
                                req.body.max,
                                req.body.stepSize,
                                char.states.id,
                            );
                            revision.content.characters = checkMinMaxValues(
                                char.id,
                                states,
                                char.states,
                                revision.content.characters,
                            );
                        }
                        if (states) {
                            if (Array.isArray(states)) {
                                if (revision.content.statements
                                    && JSON.stringify(states) !== JSON.stringify(char.states)) {
                                    const removedStates = char.states.filter((state) => {
                                        const exists = states.find(
                                            (element) => element.id === state.id,
                                        );
                                        if (exists) return false;
                                        return true;
                                    });
                                    let arr = [...revision.content.statements];
                                    removedStates.forEach((state) => {
                                        arr = arr.filter(
                                            (statement) => statement.state !== state.id,
                                        );
                                    });
                                    revision.content.statements = arr;
                                }
                                char.states = states;
                            } else {
                                [char.states] = [states];
                            }
                        }
                        const revisionId = await createRevision(
                            key,
                            revision.content,
                            revision.media,
                            req.user,
                            `Updated character: ${req.body.titleEn || req.body.titleNo}`,
                        );
                        res.status(200).json(revisionId);
                    } else res.sendStatus(404);
                } else res.sendStatus(404);
            } else res.sendStatus(404);
        } else if (req.body.type === 'NUMERICAL') {
            res.status(400).json({ error: 'Missing unit name' });
        } else res.status(400).json({ error: 'Missing alternatives' });
    } catch (err) {
        logError('Could not update character', err);
        res.sendStatus(500);
    }
});

/**
 * Create new character for key
 */
router.post('/', [
    body('keyId').isUUID(4),
    body('revisionId').isUUID(4),
    oneOf([
        body('titleNo').isString().isLength({ min: 1 }),
        body('titleEn').isString().isLength({ min: 1 }),
    ]),
    body('descriptionNo').isString().optional(),
    body('descriptionEn').isString().optional(),
    body('type').custom((value) => {
        if (!['EXCLUSIVE', 'MULTISTATE', 'NUMERICAL'].some((element) => element === value)) throw new Error('Invalid value');
        return true;
    }),
    oneOf([
        body('alternatives').isArray(),
        [
            body('unitNo').isString().optional(),
            body('unitEn').isString().optional(),
            body('min').isFloat(),
            body('max').isFloat(),
            body('stepSize').isFloat(),
        ],
    ]),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        if ((req.body.type === 'NUMERICAL' && (req.body.unitNo || req.body.unitEn))
            || ((req.body.type === 'EXCLUSIVE' || req.body.type === 'MULTISTATE')
                && req.body.alternatives && req.body.alternatives.length > 1)) {
            const key = await Key.findByPk(req.body.keyId);
            if (key) {
                let states;
                const character = await Character.create({
                    type: req.body.type,
                    keyId: req.body.keyId,
                });
                if (character.type === 'EXCLUSIVE' || character.type === 'MULTISTATE') {
                    states = await createMultiStates(
                        character,
                        req.body.alternatives,
                    );
                } else {
                    const unit = {};
                    if (req.body.unitNo) unit.no = req.body.unitNo;
                    if (req.body.unitEn) unit.en = req.body.unitEn;
                    states = await createNumericalState(
                        character.id,
                        unit,
                        req.body.min,
                        req.body.max,
                        req.body.stepSize,
                    );
                }
                const revision = await findRevisionForKey(
                    req.body.revisionId,
                    req.body.keyId,
                );
                if (!revision.content.characters) revision.content.characters = [];
                let info = {};
                info = setCharacterInfo(info, req.body);
                revision.content.characters.push({
                    id: `${character.id}`,
                    title: info.title,
                    description: info.description,
                    type: req.body.type.toLowerCase(),
                    states: Array.isArray(states)
                        ? states.map((state) => ({ id: `${state.id}`, title: state.title, description: state.description }))
                        : states,
                });
                const revisionId = await createRevision(
                    key,
                    revision.content,
                    revision.media,
                    req.user,
                    `Created new character: ${req.body.titleEn ? req.body.titleEn : req.body.titleNo}`,
                );
                res.status(200).json({ revisionId, characterId: `${character.id}` });
            } else res.sendStatus(404);
        } else if (req.body.type === 'NUMERICAL') {
            res.status(400).json({ error: 'Missing unit name' });
        } else res.status(400).json({ error: 'Missing alternatives' });
    } catch (err) {
        logError('Could not create new character', err);
        res.sendStatus(500);
    }
});

/**
 * Create new state for character
 */
router.post('/state', [
    body('keyId').isUUID(4),
    body('characterId').isInt().optional(),
], isValidInput, isPermittedKey('EDIT_KEY'), async (req, res) => {
    try {
        const state = await CharacterState.create({
            characterId: req.body.characterId,
        });
        res.status(200).json(state.id);
    } catch (err) {
        logError('Could not create new state for character', err);
        res.sendStatus(500);
    }
});

export default router;
