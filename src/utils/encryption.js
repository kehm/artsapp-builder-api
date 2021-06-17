import crypto from 'crypto';

const ALGORITHM = 'aes-256-ctr';

/**
 * Encrypt using SHA-256
 *
 * @param {string} key Secret key
 * @param {Object} buffer Buffer
 * @returns {Object} Encrypted buffer
 */
export const encryptSha256 = (encryptionKey, buffer) => {
    const key = crypto.createHash('sha256').update(encryptionKey).digest('base64').substr(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
};

/**
 * Decrypt SHA-256
 *
 * @param {string} key Secret key
 * @param {Object} encrypted Encrypted object
 * @returns {Object} Decrypted buffer
 */
export const decryptSha256 = (decryptionKey, encrypted) => {
    const key = crypto.createHash('sha256').update(decryptionKey).digest('base64').substr(0, 32);
    const iv = encrypted.slice(0, 16);
    const object = encrypted.slice(16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(object), decipher.final()]);
};
