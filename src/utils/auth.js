import axios from 'axios';
import Sequelize from 'sequelize';
import postgres from '../config/postgres';
import Organization from '../lib/database/models/Organization';
import Permissions from '../lib/database/models/Permissions';
import User from '../lib/database/models/User';
import Workgroups from '../lib/database/models/Workgroups';
import { encryptSha256 } from './encryption';

/**
 * Check if token issuer and audience (client ID) are correct
 *
 * @param {Object} token JWT
 * @returns {boolean} True if token is valid
 */
export const isTokenValid = (token) => {
    if (token.iss !== `https://${process.env.OIDC_ISSUER}` || token.aud !== process.env.OIDC_CLIENT_ID) {
        return false;
    }
    return true;
};

/**
 * Get the ID of the organization where the user is a member
 *
 * @param {string} encryptedToken Encrypted OIDC access token
 * @returns {Array} List of groups that the user is a member of
 */
const getUserOrganizationId = async (accessToken) => {
    const response = await axios.get(
        `${process.env.IDP_GROUPS_API}/me/groups`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            timeout: parseInt(process.env.HTTP_TIMEOUT, 10),
        },
    );
    if (response && response.data) {
        const groups = response.data.filter((element) => element.type === 'fc:org');
        if (groups.length > 0) {
            const organizations = await Organization.findAll();
            for (let i = 0; i < groups.length; i += 1) {
                const organization = organizations.find(
                    (element) => element.idpId === groups[i].id,
                );
                if (organization) return organization.id;
            }
        }
    }
    return null;
};

/**
 * Update existing user object (in case the user's IDP record has changed)
 *
 * @param {Object} user Existing user object
 * @param {Object} newUser New user object
 */
const updateExistingUser = async (user, newUser) => {
    let roleId;
    if (newUser.organizationId) {
        if (newUser.organizationId === user.organizationId) {
            roleId = user.roleId;
        } else roleId = 3;
    }
    await User.update({
        name: newUser.name,
        email: newUser.email,
        accessToken: newUser.accessToken,
        expiresAt: newUser.expiresAt,
        scope: newUser.scope,
        idToken: newUser.idToken,
        organizationId: newUser.organizationId,
        roleId,
    }, {
        where: { idpId: user.idpId },
    });
};

/**
 * Create or find user object in database
 *
 * @param {Object} tokenSet Token info
 * @param {Object} userInfo User info
 * @returns {Object} User object
 */
export const createUserIfNotExists = async (tokenSet, userInfo) => {
    const organizationId = await getUserOrganizationId(tokenSet.access_token);
    const newUser = {
        idpId: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
        accessToken: encryptSha256(process.env.ENCRYPTION_SECRET, tokenSet.access_token).toString('base64'),
        expiresAt: tokenSet.expires_at,
        scope: process.env.OIDC_SCOPE,
        idToken: encryptSha256(process.env.ENCRYPTION_SECRET, tokenSet.id_token).toString('base64'),
        organizationId,
        roleId: parseInt(process.env.DEFAULT_ROLE_ID, 10),
    };
    const [user, created] = await User.findOrCreate({
        where: {
            idpId: newUser.idpId,
        },
        defaults: newUser,
    });
    if (!created) await updateExistingUser(user, newUser);
    return user;
};

/**
 * Get user profile
 *
 * @param {string} id User ID
 * @returns {Object} User profile object
 */
export const getUserProfile = async (id) => {
    let profile = {};
    const user = await User.findByPk(id);
    if (user) {
        let permissions = [];
        if (user.roleId) {
            permissions = await Permissions.findAll({ where: { roleId: user.roleId } });
        }
        const workgroups = await Workgroups.findAll({
            where: { userId: id },
            attributes: ['workgroupId'],
        });
        profile = {
            name: user.name,
            organizationId: user.organizationId,
            roleId: user.roleId,
            workgroups: workgroups.map((element) => element.workgroupId),
            permissions: permissions.map((element) => element.permissionName),
        };
    }
    return profile;
};

/**
 * Get user permissions
 *
 * @param {string} userId User ID
 * @param {string} permission Permission name
 * @returns {Array} Permission names, organization IDs and workgroup IDs
 */
export const getUserPermissions = async (userId, permission) => {
    const user = `${process.env.POSTGRES_SCHEMA}.artsapp_user`;
    const rolePermissions = `${process.env.POSTGRES_SCHEMA}.role_permissions`;
    const userWorkgroups = `${process.env.POSTGRES_SCHEMA}.user_workgroups`;
    const permissions = await postgres.query(
        `SELECT ${rolePermissions}.permission_name, ${user}.organization_id, ${userWorkgroups}.workgroup_id FROM ${user} `
        + `INNER JOIN ${rolePermissions} `
        + `ON ${user}.role_id = ${rolePermissions}.role_id `
        + `LEFT JOIN ${userWorkgroups} `
        + `ON ${user}.artsapp_user_id = ${userWorkgroups}.artsapp_user_id `
        + `WHERE ${user}.artsapp_user_id = ? `
        + `AND ${rolePermissions}.permission_name IN (?) `,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: [userId, permission],
            model: User,
            mapToModel: true,
            raw: true,
        },
    );
    return permissions;
};
