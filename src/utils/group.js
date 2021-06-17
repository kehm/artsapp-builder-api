import Sequelize from 'sequelize';
import postgres from '../config/postgres.js';
import Group from '../lib/database/models/Group.js';
import GroupInfo from '../lib/database/models/GroupInfo.js';
import GroupParents from '../lib/database/models/GroupParents.js';

/**
 * Create key group info for no/en and add group parent
 *
 * @param {int} groupId Key group ID
 * @param {Object} body Request body
 */
export const createGroupInfo = async (groupId, body) => {
    const promises = [];
    promises.push(GroupInfo.create({
        groupId,
        name: body.nameNo,
        description: body.descriptionNo,
        languageCode: 'no',
    }));
    promises.push(GroupInfo.create({
        groupId,
        name: body.nameEn,
        description: body.descriptionEn,
        languageCode: 'en',
    }));
    if (body.parentId) {
        promises.push(GroupParents.create({
            groupId,
            parentId: body.parentId,
        }));
    }
    await Promise.all(promises);
};

/**
 * Update group info
 *
 * @param {Array} groups Group languages array
 * @param {int} groupId Group ID
 * @param {Object} body Request body
 */
export const updateGroupInfos = async (groups, groupId, body) => {
    const promises = [];
    const infoNo = groups.find((element) => element.key_group_info && element.key_group_info.languageCode === 'no');
    const infoEn = groups.find((element) => element.key_group_info && element.key_group_info.languageCode === 'en');
    if (infoNo && infoNo.key_group_info) {
        promises.push(GroupInfo.update({
            name: body.nameNo,
            description: body.descriptionNo,
        }, {
            where: { id: infoNo.key_group_info.id },
        }));
    } else {
        promises.push(GroupInfo.create({
            groupId,
            name: body.nameNo,
            description: body.descriptionNo,
            languageCode: 'no',
        }));
    }
    if (infoEn && infoEn.key_group_info) {
        promises.push(GroupInfo.update({
            name: body.nameEn,
            description: body.descriptionEn,
        }, {
            where: { id: infoEn.key_group_info.id },
        }));
    } else {
        promises.push(GroupInfo.create({
            groupId,
            name: body.nameEn,
            description: body.descriptionEn,
            languageCode: 'en',
        }));
    }
    await Promise.all(promises);
};

/**
 * Update key group parent
 *
 * @param {int} groupId Key group ID
 * @param {int} parentId Parent key group ID
 */
export const updateGroupParents = async (groupId, parentId) => {
    const parent = await GroupParents.findOne({ where: { groupId } });
    if (parent) {
        if (parent.parentId !== parentId) {
            if (parentId === 0) {
                await parent.destroy();
            } else await parent.update({ parentId });
        }
    } else if (parentId !== 0) {
        await GroupParents.create({ groupId, parentId });
    }
};

/**
 * Get key group by ID
 *
 * @param {int} groupId Group ID
 * @param {string} language Language code
 * @returns {Array} Key group array
 */
export const getKeyGroupById = async (groupId, language) => {
    const group = `${process.env.POSTGRES_SCHEMA}.key_group`;
    const groupInfo = `${process.env.POSTGRES_SCHEMA}.key_group_info`;
    const groupParents = `${process.env.POSTGRES_SCHEMA}.key_group_parents`;
    const groupMedia = `${process.env.POSTGRES_SCHEMA}.key_group_media`;
    const groups = await postgres.query(
        `SELECT ${group}.key_group_id, ${groupInfo}.language_code, ${groupInfo}.name, ${groupInfo}.description, `
        + `${groupParents}.key_group_parent_id as parent_id, ${groupMedia}.media_id FROM ${group} `
        + `INNER JOIN ${groupInfo} `
        + `ON ${group}.key_group_id = ${groupInfo}.key_group_id `
        + `LEFT JOIN ${groupParents} `
        + `ON ${group}.key_group_id = ${groupParents}.key_group_id `
        + `LEFT JOIN ${groupMedia} `
        + `ON ${group}.key_group_id = ${groupMedia}.key_group_id `
        + `WHERE ${group}.key_group_id = ? `
        + `${language ? `AND ${groupInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [groupId, language],
            model: Group,
            mapToModel: true,
            raw: true,
        },
    );
    return groups;
};

/**
 * Get key groups
 *
 * @param {string} language Language code
 * @returns {Array} Key group array
 */
export const getKeyGroups = async (language) => {
    const keyGroup = `${process.env.POSTGRES_SCHEMA}.key_group`;
    const keyGroupInfo = `${process.env.POSTGRES_SCHEMA}.key_group_info`;
    const keyGroupParents = `${process.env.POSTGRES_SCHEMA}.key_group_parents`;
    const groups = await postgres.query(
        `SELECT ${keyGroup}.key_group_id, ${keyGroupInfo}.language_code, ${keyGroupInfo}.name, `
        + `${keyGroupInfo}.description, ${keyGroupParents}.key_group_parent_id as parent_id FROM ${keyGroup} `
        + `INNER JOIN ${keyGroupInfo} `
        + `ON ${keyGroup}.key_group_id = ${keyGroupInfo}.key_group_id `
        + `LEFT JOIN ${keyGroupParents} `
        + `ON ${keyGroup}.key_group_id = ${keyGroupParents}.key_group_id `
        + `${language ? `WHERE ${keyGroupInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [language],
            model: Group,
            mapToModel: true,
            raw: true,
        },
    );
    return groups;
};
