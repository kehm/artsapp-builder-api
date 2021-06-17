import Sequelize from 'sequelize';
import postgres from '../config/postgres.js';
import Collection from '../lib/database/models/Collection.js';
import CollectionInfo from '../lib/database/models/CollectionInfo.js';

/**
 * Create collection info for no/en
 *
 * @param {int} collectionId Collection ID
 * @param {Object} body Request body
 */
export const createCollectionInfo = async (collectionId, body) => {
    const promises = [];
    promises.push(CollectionInfo.create({
        collectionId,
        name: body.nameNo,
        description: body.descriptionNo,
        languageCode: 'no',
    }));
    promises.push(CollectionInfo.create({
        collectionId,
        name: body.nameEn,
        description: body.descriptionEn,
        languageCode: 'en',
    }));
    await Promise.all(promises);
};

/**
 * Update collection info
 *
 * @param {Array} collections Collections info array
 * @param {int} collectionId Collection ID
 * @param {Object} body Request body
 */
export const updateCollectionInfos = async (collections, collectionId, body) => {
    const promises = [];
    const infoNo = collections.find((element) => element.collection_info && element.collection_info.languageCode === 'no');
    const infoEn = collections.find((element) => element.collection_info && element.collection_info.languageCode === 'en');
    if (infoNo && infoNo.collection_info) {
        promises.push(CollectionInfo.update({
            name: body.nameNo,
            description: body.descriptionNo,
        }, {
            where: { id: infoNo.collection_info.id },
        }));
    } else {
        promises.push(CollectionInfo.create({
            collectionId,
            name: body.nameNo,
            description: body.descriptionNo,
            languageCode: 'no',
        }));
    }
    if (infoEn && infoEn.collection_info) {
        promises.push(CollectionInfo.update({
            name: body.nameEn,
            description: body.descriptionEn,
        }, {
            where: { id: infoEn.collection_info.id },
        }));
    } else {
        promises.push(CollectionInfo.create({
            collectionId,
            name: body.nameEn,
            description: body.descriptionEn,
            languageCode: 'en',
        }));
    }
    await Promise.all(promises);
};

/**
 * Get collections by ID
 *
 * @param {int} id Collection ID
 * @param {string} language Language code
 * @returns {Array} Collections array
 */
export const getCollectionById = async (id, language) => {
    const collection = `${process.env.POSTGRES_SCHEMA}.collection`;
    const collectionInfo = `${process.env.POSTGRES_SCHEMA}.collection_info`;
    const collections = await postgres.query(
        `SELECT ${collection}.collection_id as id, ${collection}.workgroup_id, `
        + `${collectionInfo}.language_code, ${collectionInfo}.name, ${collectionInfo}.description FROM ${collection} `
        + `INNER JOIN ${collectionInfo} `
        + `ON ${collection}.collection_id = ${collectionInfo}.collection_id `
        + `WHERE ${collection}.collection_id = ? `
        + `${language ? `AND ${collectionInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [id, language],
            model: Collection,
            mapToModel: true,
            raw: true,
        },
    );
    return collections;
};

/**
 * Get collections
 *
 * @param {string} language Language code
 * @returns {Array} Collections array
 */
export const getCollections = async (language) => {
    const collection = `${process.env.POSTGRES_SCHEMA}.collection`;
    const collectionInfo = `${process.env.POSTGRES_SCHEMA}.collection_info`;
    const collections = await postgres.query(
        `SELECT ${collection}.collection_id, ${collection}.workgroup_id, `
        + `${collectionInfo}.language_code, ${collectionInfo}.name, ${collectionInfo}.description FROM ${collection} `
        + `INNER JOIN ${collectionInfo} `
        + `ON ${collection}.collection_id = ${collectionInfo}.collection_id `
        + `${language ? `WHERE ${collectionInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [language],
            model: Collection,
            mapToModel: true,
            raw: true,
        },
    );
    return collections;
};
