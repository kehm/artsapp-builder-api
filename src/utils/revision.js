import Revision from '../lib/database/models/Revision.js';
import Revisions from '../lib/database/models/Revisions.js';

/**
 * Create revision and link to key
 *
 * @param {Object} key Key object
 * @param {Object} content Content object
 * @param {Object} media Media elements object
 * @param {string} createdBy Created by string
 * @param {string} note Optional revision note
 * @returns {string} Revision ID
 */
export const createRevision = async (key, content, media, createdBy, note) => {
    const revision = await Revision.create({
        content,
        media,
        note,
        createdBy,
        status: 'DRAFT',
    });
    const keyRevision = await Revisions.create({
        keyId: key.id,
        revisionId: revision.id,
    });
    if (!key.revisionId) {
        await revision.update({ status: 'ACCEPTED' });
        await key.update({ revisionId: revision.id });
    }
    return keyRevision.revisionId;
};

/**
 * Find revision and check if it belongs to the specified key
 *
 * @param {string} revisionId Revision ID
 * @param {string} keyId Key ID
 * @returns {Object} Revision
 */
export const findRevisionForKey = async (revisionId, keyId) => {
    const keyRevision = await Revisions.findOne({
        where: { revisionId, keyId },
    });
    if (keyRevision) {
        const revision = await Revision.findByPk(revisionId);
        if (revision) return revision;
    }
    throw new Error();
};
