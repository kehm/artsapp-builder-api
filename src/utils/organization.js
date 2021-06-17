import Sequelize from 'sequelize';
import postgres from '../config/postgres';
import Organization from '../lib/database/models/Organization';
import Role from '../lib/database/models/Role';

/**
 * Get organizations info
 *
 * @param {string} language Language code
 * @returns {Array} Organizations
 */
export const getOrganizations = async (language) => {
    const organization = `${process.env.POSTGRES_SCHEMA}.organization`;
    const organizationInfo = `${process.env.POSTGRES_SCHEMA}.organization_info`;
    const organizations = await postgres.query(
        `SELECT ${organization}.organization_id as id, ${organizationInfo}.full_name, ${organizationInfo}.short_name, `
        + `${organizationInfo}.description, ${organizationInfo}.home_url as url FROM ${organization} `
        + `INNER JOIN ${organizationInfo} `
        + `ON ${organization}.organization_id = ${organizationInfo}.organization_id `
        + `WHERE ${organization}.organization_status_name = ? `
        + `${language ? `AND ${organizationInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: ['ACTIVE', language],
            model: Organization,
            mapToModel: true,
        },
    );
    return organizations;
};

/**
 * Get organization info by ID
 *
 * @param {int} organizationId Organization ID
 * @param {string} language Language code
 * @returns {Array} Organization info
 */
export const getOrganizationById = async (organizationId, language) => {
    const organization = `${process.env.POSTGRES_SCHEMA}.organization`;
    const organizationInfo = `${process.env.POSTGRES_SCHEMA}.organization_info`;
    const organizations = await postgres.query(
        `SELECT ${organization}.organization_id as id, ${organizationInfo}.language_code as language, `
        + `${organizationInfo}.full_name as fullname, ${organizationInfo}.short_name as shortname, ${organizationInfo}.home_url as url FROM ${organization} `
        + `INNER JOIN ${organizationInfo} `
        + `ON ${organization}.organization_id = ${organizationInfo}.organization_id `
        + `WHERE ${organization}.organization_id = ? `
        + `AND ${organization}.organization_status_name = ? `
        + `${language ? `AND ${organizationInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [organizationId, 'ACTIVE', language],
            model: Organization,
            mapToModel: true,
        },
    );
    return organizations;
};

/**
 * Get role info by ID
 *
 * @param {int} roleId Role ID
 * @param {string} language Language code
 * @returns {Array} Role info
 */
export const getRoleById = async (roleId, language) => {
    const role = `${process.env.POSTGRES_SCHEMA}.role`;
    const roleInfo = `${process.env.POSTGRES_SCHEMA}.role_info`;
    const roles = await postgres.query(
        `SELECT ${role}.role_id as id, ${roleInfo}.language_code as language, `
        + `${roleInfo}.name, ${roleInfo}.description FROM ${role} `
        + `INNER JOIN ${roleInfo} `
        + `ON ${role}.role_id = ${roleInfo}.role_id `
        + `WHERE ${role}.role_id = ? `
        + `${language ? `AND ${roleInfo}.language_code = ?` : ''}`,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [roleId, language],
            model: Role,
            mapToModel: true,
        },
    );
    return roles;
};
