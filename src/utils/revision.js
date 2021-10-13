import Key from '../lib/database/models/Key.js';
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
 * @param {int} mode Key mode (set default if undefined)
 * @returns {string} Revision ID
 */
export const createRevision = async (key, content, media, createdBy, note, mode) => {
    const revision = await Revision.create({
        content,
        media,
        note,
        createdBy,
        status: 'DRAFT',
        mode: mode || parseInt(process.env.DEFAULT_KEY_MODE, 10),
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
 * Find revision and key (checks if revision belongs to the specified key)
 *
 * @param {string} revisionId Revision ID
 * @param {string} keyId Key ID
 * @returns {Object} Revision and key
 */
export const findRevisionForKey = async (revisionId, keyId) => {
    const keyRevision = await Revisions.findOne({
        where: { revisionId, keyId },
    });
    if (keyRevision) {
        const revision = await Revision.findByPk(revisionId);
        const key = await Key.findByPk(keyId);
        if (revision) return { revision, key };
    }
    throw new Error();
};
