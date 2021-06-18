import Sequelize from 'sequelize';
import Collections from '../lib/database/models/Collections.js';
import Editors from '../lib/database/models/Editors.js';
import Group from '../lib/database/models/Group.js';
import Key from '../lib/database/models/Key.js';
import KeyInfo from '../lib/database/models/KeyInfo.js';
import KeyMedia from '../lib/database/models/KeyMedia.js';
import Languages from '../lib/database/models/Languages.js';
import Organization from '../lib/database/models/Organization.js';
import OrganizationInfo from '../lib/database/models/OrganizationInfo.js';
import Publishers from '../lib/database/models/Publishers.js';
import Revision from '../lib/database/models/Revision.js';
import User from '../lib/database/models/User.js';
import Workgroup from '../lib/database/models/Workgroup.js';
import { getEntityMedia, getKeyMedia } from './media.js';

/**
 * Get key by ID
 *
 * @param {string} id Key ID
 * @param {string} language Language code
 * @returns {Array} Keys
 */
const getKeyById = async (id, language) => {
    const keys = await Key.findAll({
        attributes: {
            exclude: ['created_by', 'workgorupId',
                'workgroup_id', 'key_group_id', 'revision_id', 'key_status_name'],
        },
        include: [
            {
                model: KeyInfo,
                where: language ? { languageCode: language } : {},
                attributes: ['id', 'languageCode', 'title', 'description'],
            },
            {
                model: Workgroup,
                attributes: ['id', 'name'],
                include: [
                    {
                        model: Organization,
                        attributes: ['id'],
                        include: [
                            {
                                model: OrganizationInfo,
                                where: language ? { languageCode: language } : {},
                                attributes: ['fullName'],
                            },
                        ],
                    },
                ],
            },
            {
                model: User,
                attributes: ['name'],
            },
        ],
        where: {
            id,
            status: { [Sequelize.Op.not]: 'HIDDEN' },
        },
    });
    if (keys && keys.length > 0) return keys;
    throw new Error();
};

/**
 * Get key with details (languages, publishers and media)
 *
 * @param {*} keyId Key ID
 * @param {*} language Language code
 * @returns {Array} Array of key, key languages, key publishers and media
 */
export const getKey = async (keyId, language) => {
    const promises = [];
    promises.push(getKeyById(keyId, language));
    promises.push(new Promise((resolve, reject) => {
        Languages.findAll({ where: { keyId } }).then((languages) => {
            resolve(languages.map((element) => element.languageCode));
        }).catch((err) => reject(err));
    }));
    promises.push(new Promise((resolve, reject) => {
        Publishers.findAll({ where: { keyId } }).then((publishers) => {
            resolve(publishers.map((element) => element.organizationId));
        }).catch((err) => reject(err));
    }));
    promises.push(getKeyMedia(keyId, language));
    promises.push(new Promise((resolve, reject) => {
        Collections.findAll({ where: { keyId } }).then((collections) => {
            resolve(collections.map((element) => element.collectionId));
        }).catch((err) => reject(err));
    }));
    const responses = await Promise.all(promises);
    return responses;
};

/**
 * Get all published/beta keys and keys created by the user
 *
 * @param {string} createdBy User ID
 * @param {string} language Language code
 * @param {boolean} personal True if only get keys created by user
 * @returns {Array} Keys
 */
export const getKeys = async (createdBy, language, personal) => {
    const all = {
        status: { [Sequelize.Op.not]: 'HIDDEN' },
    };
    const user = {
        status: { [Sequelize.Op.not]: 'HIDDEN' },
        createdBy,
    };
    const keys = await Key.findAll({
        attributes: { exclude: ['created_by', 'createdBy'] },
        order: [['created_at', 'DESC']],
        include: [
            {
                model: KeyInfo,
                where: language ? { languageCode: language } : {},
            },
            { model: Workgroup },
            { model: Group },
        ],
        where: personal ? user : all,
    });
    const promises = [];
    keys.forEach((key) => {
        promises.push(getEntityMedia(
            'key_media',
            'artsapp_key_id',
            KeyMedia,
            key.id,
        ));
    });
    const media = await Promise.all(promises);
    const arr = keys.map((key, index) => {
        const tmp = key.get({ plain: true });
        tmp.media = media[index];
        return (tmp);
    });
    return arr;
};

/**
 * Create key languages and key info entries
 *
 * @param {string} keyId Key ID
 * @param {Object} body Request body
 */
export const createKeyMetadata = async (keyId, body) => {
    const promises = [];
    body.languages.forEach((languageCode) => {
        promises.push(Languages.create({ keyId, languageCode }));
    });
    if (body.titleNo) {
        promises.push(KeyInfo.create({
            keyId,
            title: body.titleNo,
            description: body.descriptionNo,
            languageCode: 'no',
        }));
    }
    if (body.titleEn) {
        promises.push(KeyInfo.create({
            keyId,
            title: body.titleEn,
            description: body.descriptionEn,
            languageCode: 'en',
        }));
    }
    if (body.collections && body.collections.length > 0) {
        body.collections.forEach((collectionId) => {
            promises.push(Collections.create({ keyId, collectionId }));
        });
    }
    await Promise.all(promises);
};

/**
 * Check if user is an editor for the key
 *
 * @param {string} keyId Key ID
 * @param {string} userId User ID
 * @returns {boolean} True if user is an editor of the key
 */
export const isKeyEditor = async (keyId, userId) => {
    const editor = await Editors.findOne({
        where: { keyId, userId },
    });
    if (editor) return true;
    return false;
};

/**
 * Update key collections list
 *
 * @param {string} keyId Key ID
 * @param {Array} collectionIds Array of collection IDs
 */
export const updateCollections = async (keyId, collectionIds) => {
    const promises = [];
    const collections = await Collections.findAll({ where: { keyId } });
    const removed = [];
    const added = [];
    collections.forEach((element) => {
        if (!collectionIds.includes(element.collectionId)) removed.push(element.id);
    });
    collectionIds.forEach((id) => {
        if (!collections.find((element) => element.collectionId === id)) added.push(id);
    });
    if (removed.length > 0) {
        promises.push(Collections.destroy({
            where: {
                id: { [Sequelize.Op.in]: removed },
            },
        }));
    }
    if (added.length > 0) {
        added.forEach((collectionId) => {
            promises.push(Collections.create({ keyId, collectionId }));
        });
    }
    await Promise.all(promises);
};

/**
 * Update key attributes
 *
 * @param {string} keyId Key ID
 * @param {Object} body Request body
 */
export const handleUpdateKey = async (keyId, body) => {
    const revision = await Revision.findByPk(body.revisionId);
    if (revision.status === 'ACCEPTED') {
        await Key.update({
            version: body.version,
            status: body.status,
            creators: body.creators,
            contributors: body.contributors,
            keyGroupId: body.groupId ? body.groupId : null,
            workgroupId: body.workgroupId ? body.workgroupId : null,
            revisionId: body.revisionId,
        }, {
            where: { id: keyId },
        });
    } else throw new Error();
};

/**
 * Add or remove key languages
 *
 * @param {string} keyId Key ID
 * @param {string} languages Languages
 * @returns
 */
export const handleSetKeyLanguages = async (keyId, languages) => {
    const keyLanguages = await Languages.findAll({ where: { keyId } });
    const promises = [];
    keyLanguages.forEach((keyLanguage) => {
        if (!languages.find((element) => element === keyLanguage.languageCode)) {
            promises.push(keyLanguage.destroy());
        }
    });
    languages.forEach((languageCode) => {
        promises.push(Languages.findOrCreate({
            where: { keyId, languageCode },
        }));
    });
    await Promise.all(promises);
};

/**
 * Add or remove key publishers
 *
 * @param {string} keyId Key ID
 * @param {Array} publishers Publishers
 * @returns
 */
export const handleSetKeyPublishers = async (keyId, publishers) => {
    const keyOrganizations = await Publishers.findAll({ where: { keyId } });
    const promises = [];
    keyOrganizations.forEach((keyOrganization) => {
        if (!publishers.find((element) => element === keyOrganization.organizationId)) {
            promises.push(keyOrganization.destroy());
        }
    });
    publishers.forEach((organizationId) => {
        promises.push(Publishers.findOrCreate({
            where: { keyId, organizationId },
        }));
    });
    await Promise.all(promises);
};

/**
 * Add, update or delete key info
 *
 * @param {string} keyId Key ID
 * @param {Array} keys Keys array
 * @param {Object} body Request body
 * @returns
 */
export const handleSetKeyInfo = async (keyId, keys, body) => {
    const promises = [];
    const infoNo = keys.find((element) => element.key_info && element.key_info.languageCode === 'no');
    const infoEn = keys.find((element) => element.key_info && element.key_info.languageCode === 'en');
    if (body.titleNo) {
        if (infoNo && infoNo.key_info) {
            promises.push(KeyInfo.update({
                title: body.titleNo,
                description: body.descriptionNo,
            }, {
                where: { id: infoNo.key_info.id },
            }));
        } else {
            promises.push(KeyInfo.create({
                keyId,
                title: body.titleNo,
                description: body.descriptionNo,
                languageCode: 'no',
            }));
        }
    } else if (!body.descriptionNo && infoNo) {
        promises.push(KeyInfo.destroy({ where: { id: infoNo.key_info.id } }));
    }
    if (body.titleEn) {
        if (infoEn && infoEn.key_info) {
            promises.push(KeyInfo.update({
                title: body.titleEn,
                description: body.descriptionEn,
            }, {
                where: { id: infoEn.key_info.id },
            }));
        } else {
            promises.push(KeyInfo.create({
                keyId,
                title: body.titleEn,
                description: body.descriptionEn,
                languageCode: 'en',
            }));
        }
    } else if (!body.descriptionEn && infoEn) {
        promises.push(KeyInfo.destroy({ where: { id: infoEn.key_info.id } }));
    }
    await Promise.all(promises);
};
