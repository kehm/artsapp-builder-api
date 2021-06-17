import sharp from 'sharp';
import Sequelize from 'sequelize';
import fs from 'fs';
import path from 'path';
import Character from '../lib/database/models/Character.js';
import CharacterState from '../lib/database/models/CharacterState.js';
import Key from '../lib/database/models/Key.js';
import KeyMedia from '../lib/database/models/KeyMedia.js';
import Media from '../lib/database/models/Media.js';
import MediaInfo from '../lib/database/models/MediaInfo.js';
import Taxon from '../lib/database/models/Taxon.js';
import Group from '../lib/database/models/Group.js';
import GroupMedia from '../lib/database/models/GroupMedia.js';
import CollectionMedia from '../lib/database/models/CollectionMedia.js';
import Collection from '../lib/database/models/Collection.js';
import postgres from '../config/postgres.js';
import Revision from '../lib/database/models/Revision.js';
import { findTaxonById } from './taxon.js';
import Revisions from '../lib/database/models/Revisions.js';

/**
 * Resize image file
 *
 * @param {Object} file Image file
 * @param {int} width Width in pixels
 * @param {int} height Height in pixels
 * @param {int} quality Quality
 * @param {string} newName New file ending (to distinguish from existing file)
 */
const resizeImage = (file, width, height, quality, newName) => new Promise((resolve, reject) => {
    const name = file.filename.split('.')[0];
    Media.findOne({ where: { fileName: file.filename } }).then((media) => {
        if (media) {
            switch (file.mimetype) {
                case 'image/jpeg':
                    sharp(file.path)
                        .resize(width, height)
                        .jpeg({ quality })
                        .toFile(path.resolve(file.destination, `${name}-${newName}.jpeg`))
                        .then(() => {
                            media.update({
                                thumbnailName: `${name}-${newName}.jpeg`,
                                thumbnailPath: `${file.destination}/${name}-${newName}.jpeg`,
                            }).then(() => {
                                resolve();
                            }).catch((err) => reject(err));
                        })
                        .catch((err) => reject(err));
                    break;
                case 'image/png':
                    sharp(file.path)
                        .resize(width, height)
                        .png({ quality })
                        .toFile(path.resolve(file.destination, `${name}-${newName}.png`))
                        .then(() => {
                            media.update({
                                thumbnailName: `${name}-${newName}.png`,
                                thumbnailPath: `${file.destination}${name}-${newName}.png`,
                            }).then(() => {
                                resolve();
                            }).catch((err) => reject(err));
                        })
                        .catch((err) => reject(err));
                    break;
                default:
                    reject();
                    break;
            }
        } else reject();
    }).catch((err) => reject(err));
});

/**
 * Resize image files
 *
 * @param {Array} files Image files
 * @param {int} width Width in pixels
 * @param {int} height Height in pixels
 * @param {int} quality Quality
 * @param {string} newName New file ending (to distinguish from existing file)
 */
export const resizeImages = async (files, width, height, quality, newName) => {
    const promises = [];
    files.forEach((file) => { promises.push(resizeImage(file, width, height, quality, newName)); });
    await Promise.all(promises);
};

/**
 * Create media and media info
 *
 * @param {Object} file File
 * @param {Object} fileInfo File info
 * @param {string} filePath File path
 * @param {string} createdBy User ID
 * @returns {Object} ID and file name
 */
const createMedia = async (file, fileInfo, filePath, createdBy) => {
    const media = await Media.create({
        type: file.mimetype,
        creators: fileInfo && fileInfo.creators ? fileInfo.creators : undefined,
        licenseUrl: fileInfo && fileInfo.licenseUrl && fileInfo.licenseUrl !== '' ? fileInfo.licenseUrl : undefined,
        createdBy,
    });
    const fileName = `${media.id}.${media.type.split('/')[1]}`;
    await media.update({
        fileName,
        filePath: `${filePath}/${fileName}`,
    });
    const promises = [];
    if (fileInfo && fileInfo.titleNo && fileInfo.titleNo !== '') {
        promises.push(MediaInfo.create({
            mediaId: media.id,
            languageCode: 'no',
            title: fileInfo.titleNo,
        }));
    }
    if (fileInfo && fileInfo.titleEn && fileInfo.titleEn !== '') {
        promises.push(MediaInfo.create({
            mediaId: media.id,
            languageCode: 'en',
            title: fileInfo.titleEn,
        }));
    }
    await Promise.all(promises);
    return { id: media.id, fileName };
};

/**
 * Add file info to media table and add media to key
 *
 * @param {string} keyId Key ID
 * @param {Object} file File
 * @param {Object} fileInfo File info
 * @param {string} createdBy User ID
 * @returns {string} Media file name
 */
export const createMediaForKey = async (keyId, file, fileInfo, createdBy) => {
    const key = await Key.findByPk(keyId);
    if (key) {
        const media = await createMedia(
            file,
            fileInfo,
            `${process.env.MEDIA_PATH}/keys/${keyId}`,
            createdBy,
        );
        await KeyMedia.create({
            keyId: key.id,
            mediaId: media.id,
        });
        return media.fileName;
    }
    throw new Error();
};

/**
 * Add file info to media table and add media to key group
 *
 * @param {int} groupId Group ID
 * @param {Object} file File
 * @param {Object} fileInfo File info
 * @param {string} createdBy User ID
 * @returns {string} Media file name
 */
export const createMediaForGroup = async (groupId, file, fileInfo, createdBy) => {
    const group = await Group.findByPk(groupId);
    if (group) {
        const media = await createMedia(
            file,
            fileInfo,
            `${process.env.MEDIA_PATH}/groups/${groupId}`,
            createdBy,
        );
        await GroupMedia.create({
            groupId: group.id,
            mediaId: media.id,
        });
        return media.fileName;
    }
    throw new Error();
};

/**
* Add file info to media table and add media to collection
*
* @param {int} collectionId Collection ID
* @param {Object} file File
* @param {Object} fileInfo File info
* @param {string} createdBy User ID
* @returns {string} Media file name
*/
export const createMediaForCollection = async (collectionId, file, fileInfo, createdBy) => {
    const collection = await Collection.findByPk(collectionId);
    if (collection) {
        const media = await createMedia(
            file,
            fileInfo,
            `${process.env.MEDIA_PATH}/collections/${collectionId}`,
            createdBy,
        );
        await CollectionMedia.create({
            collectionId: collection.id,
            mediaId: media.id,
        });
        return media.fileName;
    }
    throw new Error();
};

/**
 * Add media element to revision
 *
 * @param {Object} revision Revision object
 * @param {Object} media Media object
 * @param {Object} fileInfo File info
 * @returns {Object} Media elements and persons
 */
const addToRevisionMedia = (revision, media, fileInfo) => {
    let mediaElements = [];
    let persons = [];
    const creators = [];
    let title;
    if (revision.media.mediaElements) mediaElements = revision.media.mediaElements;
    if (revision.media.persons) persons = revision.media.persons;
    if (fileInfo && (fileInfo.titleNo || fileInfo.titleEn)) {
        title = { no: fileInfo.titleNo || undefined, en: fileInfo.titleEn || undefined };
    }
    if (fileInfo && fileInfo.creators && fileInfo.creators.length > 0) {
        fileInfo.creators.forEach((name) => {
            const id = name.replace(/\s+/g, '').toLowerCase();
            persons.push({ id, name });
            creators.push(id);
        });
    }
    mediaElements.push({
        id: `${media.id}`,
        title,
        license: fileInfo && fileInfo.licenseUrl,
        creators: creators.length > 0 ? creators : undefined,
    });
    return { mediaElements, persons };
};

/**
 * Add media to revision
 *
 * @param {int} mediaId Media ID
 * @param {Object} fileInfo File info
 * @param {string} keyId Key ID
 * @param {string} revisionId Revision ID
 * @param {int} entityId Entity ID
 * @param {string} entity Entity name
 * @param {int} characterId Character ID (if entity is character)
 */
const addMediaToRevision = async (
    media, fileInfo, keyId, revisionId, entityId, entity, characterId,
) => {
    const revision = await Revision.findByPk(revisionId);
    const keyRevision = await Revisions.findOne({
        where: { keyId, revisionId },
    });
    if (keyRevision) {
        let { content } = revision;
        let character;
        const revisionMedia = addToRevisionMedia(revision, media, fileInfo);
        if (entity === 'taxa') {
            const taxon = findTaxonById(revision.content.taxa, entityId);
            if (taxon) {
                let arr = [];
                if (taxon.media) arr = taxon.media;
                arr.push(media.id);
                taxon.media = arr;
                content = revision.content;
            }
        } else if (entity === 'characters') {
            character = revision.content.characters.find((element) => element.id === entityId);
            if (character) {
                let arr = [];
                if (character.media) arr = character.media;
                arr.push(media.id);
                character.media = arr;
            }
        } else if (entity === 'state') {
            character = revision.content.characters.find((element) => element.id === characterId);
            if (character && character.states) {
                const state = character.states.find((element) => element.id === entityId);
                let arr = [];
                if (state.media) arr = state.media;
                arr.push(`${media.id}`);
                state.media = arr;
            }
        }
        await Revision.update({
            content,
            media: revisionMedia,
        }, {
            where: { id: revisionId },
        });
    } else throw new Error();
};

/**
 * Add file info to media table and add media to entity (taxon or character)
 *
 * @param {Object} body Request body
 * @param {Object} file File
 * @param {Object} fileInfo File info
 * @param {string} createdBy User ID
 * @param {string} entity Taxa or characters
 * @returns {string} Media file name
 */
export const createMediaForEntity = async (body, file, fileInfo, createdBy, entity) => {
    let object;
    if (entity === 'taxa') {
        object = await Taxon.findOne({
            where: {
                id: parseInt(body.entityId, 10),
                keyId: body.keyId,
            },
        });
    } else if (entity === 'characters') {
        object = await Character.findOne({
            where: {
                id: parseInt(body.entityId, 10),
                keyId: body.keyId,
            },
        });
    }
    if (object) {
        const media = await createMedia(
            file,
            fileInfo,
            `${process.env.MEDIA_PATH}/keys/${body.keyId}/${entity}/${body.entityId}`,
            createdBy,
        );
        await addMediaToRevision(
            media,
            fileInfo,
            body.keyId,
            body.revisionId,
            `${body.entityId}`,
            entity,
        );
        return media.fileName;
    }
    throw new Error();
};

/**
 * Add file info to media table and add media to state
 *
 * @param {Object} body Request body
 * @param {Object} file File
 * @param {Object} fileInfo File info
 * @param {string} createdBy User ID
 * @returns {string} Media file name
 */
export const createMediaForState = async (body, file, fileInfo, createdBy) => {
    const state = await CharacterState.findByPk(
        body.stateId,
        { include: [{ model: Character }] },
    );
    if (state && `${state.taxon_character.id}` === body.entityId && state.taxon_character.keyId === body.keyId) {
        const media = await createMedia(
            file,
            fileInfo,
            `${process.env.MEDIA_PATH}/keys/${body.keyId}/characters/${body.entityId}/states/${body.stateId}`,
            createdBy,
        );
        await addMediaToRevision(
            media,
            fileInfo,
            body.keyId,
            body.revisionId,
            body.stateId,
            'state',
            body.entityId,
        );
        return media.fileName;
    }
    throw new Error();
};

/**
 * Delete media file, including thumbnail
 *
 * @param {Object} media Media object
 */
const deleteMediaFile = (media) => new Promise((resolve, reject) => {
    const promises = [];
    if (media.filePath) {
        promises.push(new Promise((resolve, reject) => {
            fs.unlink(media.filePath, (err) => {
                if (err && err.code === 'ENOENT') {
                    reject(err); // File does not exist
                } else if (err) {
                    reject(err);
                } else resolve();
            });
        }));
    }
    if (media.thumbnailPath) {
        promises.push(new Promise((resolve, reject) => {
            fs.unlink(media.thumbnailPath, (err) => {
                if (err && err.code === 'ENOENT') {
                    reject(err); // File does not exist
                } else if (err) {
                    reject(err);
                } else resolve();
            });
        }));
    }
    Promise.all(promises).then(() => {
        MediaInfo.destroy({ where: { mediaId: media.id } }).then(() => {
            media.destroy().then(() => {
                resolve();
            }).catch((err) => reject(err));
        }).catch((err) => reject(err));
    }).catch((err) => reject(err));
});

/**
 * Delete media from database and storage
 *
 * @param {int} id Media ID
 */
export const deleteMedia = async (id) => {
    const media = await Media.findByPk(id);
    await deleteMediaFile(media);
};

/**
 * Remove media from entity
 *
 * @param {Object} entity Entity
 * @param {Object} media Media
 * @param {Object} body Body
 */
export const removeEntityMedia = async (entity, media, body) => {
    const arr = [];
    const elements = [];
    entity.media.forEach((element) => {
        if (!body.media.includes(`${element}`)) arr.push(`${element}`);
    });
    if (media.mediaElements) {
        media.mediaElements.forEach((element) => {
            if (!body.media.includes(`${element.id}`)) elements.push(element);
        });
    }
    entity.media = arr;
    media.mediaElements = elements;
};

/**
 * Add, update or delete media info
 *
 * @param {int} mediaId Media ID
 * @param {Array} mediaInfo MediaInfo array
 * @param {string} titleNo Norwegian title
 * @param {string} titleEn English title
 */
export const handleSetMediaInfo = async (mediaId, mediaInfo, titleNo, titleEn) => {
    const promises = [];
    const infoNo = mediaInfo.find((info) => info.languageCode === 'no');
    const infoEn = mediaInfo.find((info) => info.languageCode === 'en');
    if (titleNo) {
        if (infoNo) {
            promises.push(MediaInfo.update({
                title: titleNo,
            }, {
                where: { id: infoNo.id },
            }));
        } else {
            promises.push(MediaInfo.create({
                mediaId,
                title: titleNo,
                languageCode: 'no',
            }));
        }
    } else if (infoNo) {
        promises.push(MediaInfo.destroy({ where: { id: infoNo.id } }));
    }
    if (titleEn) {
        if (infoEn) {
            promises.push(MediaInfo.update({
                title: titleEn,
            }, {
                where: { id: infoEn.id },
            }));
        } else {
            promises.push(MediaInfo.create({
                mediaId,
                title: titleEn,
                languageCode: 'en',
            }));
        }
    } else if (infoEn) {
        promises.push(MediaInfo.destroy({ where: { id: infoEn.id } }));
    }
    await Promise.all(promises);
};

/**
 * Update revision media element
 *
 * @param {Object} body Request body
 * @param {Object} mediaElement Revision media element
 * @param {Object} media Revision media info
 */
export const updateMediaElement = (body, mediaElement, media) => {
    if (body.titleNo || body.titleEn) {
        if (!mediaElement.title) mediaElement.title = {};
        if (body.titleNo) mediaElement.title.no = body.titleNo;
        if (body.titleEn) mediaElement.title.en = body.titleEn;
    }
    if (body.licenseUrl) mediaElement.license = body.licenseUrl;
    if (body.creators) {
        mediaElement.creators = body.creators.map((creator) => creator.replace(/\s/g, '').toLowerCase());
        body.creators.forEach((creator) => {
            const id = creator.replace(/\s/g, '').toLowerCase();
            if (!media.persons.find((person) => person.id === id)) {
                media.persons.push({ id, name: creator });
            }
        });
    }
};

/**
 * Remove media from revision entity
 *
 * @param {string} url Request URL
 * @param {Object} body Request body
 * @param {Array} taxa Taxa array
 * @param {Array} characters Character array
 * @param {Object} media Revision media
 */
export const removeFromRevision = (url, body, taxa, characters, media) => {
    let character;
    if (url === '/taxon') {
        const taxon = findTaxonById(taxa, body.entityId);
        if (taxon && taxon.media) removeEntityMedia(taxon, media, body);
    } else if (url === '/character') {
        character = characters.find((element) => element.id === body.entityId);
        if (character && character.media) removeEntityMedia(character, media, body);
    } else if (url === '/state') {
        character = characters.find((element) => element.id === body.entityId);
        const state = character.states.find((element) => element.id === body.stateId);
        if (state && state.media) removeEntityMedia(state, media, body);
    }
};

/**
 * Get media belonging to entity
 *
 * @param {string} tableName Entity media table
 * @param {string} pkName Primary key name
 * @param {Object} model Model
 * @param {string} id ID
 * @param {string} language Language code
 * @returns {Array} Entity media info
 */
export const getEntityMedia = async (tableName, pkName, model, id, language) => {
    const entityMedia = `${process.env.POSTGRES_SCHEMA}.${tableName}`;
    const media = `${process.env.POSTGRES_SCHEMA}.media`;
    const mediaInfo = `${process.env.POSTGRES_SCHEMA}.media_info`;
    const response = await postgres.query(
        `SELECT ${entityMedia}.media_id as mediaid, ${media}.file_name as filename, ${media}.thumbnail_file_name as thumbnailname, `
        + `${media}.media_type_name as mediatype, ${media}.license_url as licenseurl, ${media}.creators, `
        + `${mediaInfo}.language_code as languagecode, ${mediaInfo}.title FROM ${entityMedia} `
        + `INNER JOIN ${media} `
        + `ON ${entityMedia}.media_id = ${media}.media_id `
        + `LEFT JOIN ${mediaInfo} `
        + `ON ${entityMedia}.media_id = ${mediaInfo}.media_id `
        + `WHERE ${entityMedia}.${pkName} = ? `
        + `${language ? `AND ${mediaInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [id, 'no'],
            model,
            mapToModel: true,
            raw: true,
        },
    );
    return response;
};

/**
 * Get media for key
 *
 * @param {string} keyId Key ID
 * @param {string} language Language code
 * @returns {Array} Key media
 */
export const getKeyMedia = async (keyId, language) => {
    const keyMedia = `${process.env.POSTGRES_SCHEMA}.key_media`;
    const media = `${process.env.POSTGRES_SCHEMA}.media`;
    const mediaInfo = `${process.env.POSTGRES_SCHEMA}.media_info`;
    const response = await postgres.query(
        `SELECT ${keyMedia}.media_id as mediaid, ${media}.file_name as filename, ${media}.thumbnail_file_name as thumbnailname, `
        + `${media}.media_type_name as mediatype,${media}.license_url as licenseurl, ${media}.creators, `
        + `${mediaInfo}.language_code as languagecode, ${mediaInfo}.title FROM ${keyMedia} `
        + `INNER JOIN ${media} `
        + `ON ${keyMedia}.media_id = ${media}.media_id `
        + `LEFT JOIN ${mediaInfo} `
        + `ON ${keyMedia}.media_id = ${mediaInfo}.media_id `
        + `WHERE ${keyMedia}.artsapp_key_id = ? `
        + `${language ? `AND ${mediaInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [keyId, language],
            model: KeyMedia,
            mapToModel: true,
            raw: true,
        },
    );
    return response;
};
