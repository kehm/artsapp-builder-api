import CharacterState from '../lib/database/models/CharacterState.js';

/**
 * Set character titles and descriptions
 *
 * @param {Object} character Character object
 * @param {Object} body Request body
 * @returns {Object} Character object
 */
export const setCharacterInfo = (character, body) => {
    const char = character;
    if (!char.title) char.title = {};
    if (!char.description) char.description = {};
    if (body.titleNo) char.title.no = body.titleNo;
    if (body.titleEn) char.title.en = body.titleEn;
    if (body.descriptionNo) char.description.no = body.descriptionNo;
    if (body.descriptionEn) char.description.en = body.descriptionEn;
    return char;
};

/**
 * Create character states if they don't already exist and create states array
 *
 * @param {Object} character Character object
 * @param {Array} alternatives Alternatives array
 * @returns {Array} States
 */
export const createMultiStates = async (
    character, alternatives,
) => new Promise((resolve, reject) => {
    const promises = [];
    alternatives.forEach((alternative) => {
        promises.push(new Promise((resolve, reject) => {
            CharacterState.update(
                { characterId: character.id },
                { where: { id: alternative.id } },
            ).then((response) => {
                if (response[0]) {
                    const title = {};
                    const description = {};
                    if (alternative.title) {
                        if (alternative.title.no) title.no = alternative.title.no;
                        if (alternative.title.en) title.en = alternative.title.en;
                    }
                    if (alternative.description) {
                        if (alternative.description.no) description.no = alternative.description.no;
                        if (alternative.description.en) description.en = alternative.description.en;
                    }
                    resolve({
                        id: `${alternative.id}`,
                        title: Object.entries(title).length > 0 ? title : undefined,
                        description:
                            Object.entries(description).length > 0 ? description : undefined,
                        media: alternative.media,
                    });
                } else reject();
            }).catch((err) => reject(err));
        }));
    });
    Promise.all(promises).then((states) => {
        resolve(states);
    }).catch((err) => reject(err));
});

/**
 * Create character numerical state if it does not already exist
 *
 * @param {int} characterId Character ID
 * @param {Object} unit Unit
 * @param {float} min Minimum value
 * @param {float} max Maximum value
 * @param {float} stepSize Step size
 * @param {int} id State ID (if it should already exist)
 * @returns {Object} State
 */
export const createNumericalState = async (characterId, unit, min, max, stepSize, id) => {
    const response = await CharacterState.findOrCreate({
        where: { id: id || 0 },
        defaults: { characterId },
    });
    if (response[0]) {
        return ({
            id: `${response[0].id}`,
            unit: Object.entries(unit).length > 0 ? unit : undefined,
            min,
            max,
            stepSize,
        });
    }
    throw new Error();
};

/**
 * Remove premises that includes removed character
 *
 * @param {int} id Character ID
 * @param {Array} arr Characters array
 * @returns {Array} Updated characters
 */
export const removeStatePremises = (id, chars) => {
    const arr = [...chars];
    arr.forEach((element) => {
        if (element.logicalPremise && Array.isArray(element.logicalPremise)) {
            element.logicalPremise = element.logicalPremise.map((subElement) => {
                if (Array.isArray(subElement)) {
                    return subElement.filter((el) => el.stateId !== id);
                }
                return subElement;
            });
            element.logicalPremise = element.logicalPremise.filter(
                (subElement) => subElement.length > 1,
            );
            if (element.logicalPremise.length === 1) element.logicalPremise = undefined;
        }
    });
    return arr;
};

/**
 * Remove premises that includes the selected character
 *
 * @param {int} id Character ID
 * @param {Array} arr Characters array
 * @returns {Array} Updated characters
 */
const removeCharacterPremises = (id, chars) => {
    const arr = [...chars];
    arr.forEach((element) => {
        if (element.logicalPremise && Array.isArray(element.logicalPremise)) {
            element.logicalPremise = element.logicalPremise.map((subElement) => {
                if (Array.isArray(subElement)) {
                    return subElement.filter((el) => el.characterId !== id);
                }
                return subElement;
            });
            element.logicalPremise = element.logicalPremise.filter(
                (subElement) => subElement.length > 1,
            );
        }
    });
    return arr;
};

/**
 * Remove character from logical premises if changes to step size, min or max
 *
 * @param {Object} id Character ID
 * @param {Object} newValues New values
 * @param {Object} existingValues Existing values
 * @param {Array} characters Characters array
 * @returns {Array} Updated characters
 */
export const checkMinMaxValues = (id, newValues, existingValues, characters) => {
    let arr = [...characters];
    if (existingValues.stepSize !== newValues.stepSize
        || existingValues.min < newValues.min || existingValues.max > newValues.max) {
        arr = removeCharacterPremises(id, arr);
    }
    return arr;
};
