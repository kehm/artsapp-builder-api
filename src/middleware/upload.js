import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logError } from '../utils/logger.js';
import {
    createMediaForKey, createMediaForState, createMediaForGroup,
    createMediaForCollection, createMediaForEntity,
} from '../utils/media.js';

// Set storage engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const filePath = `${process.env.MEDIA_PATH}/${file.mediaPath}/`;
        if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, { recursive: true });
        cb(null, filePath);
    },
    filename: (req, file, cb) => cb(null, file.mediaFileName),
});

/**
 * Validate file extension and mime type
 *
 * @param {Object} file File
 */
const validateFileType = (file) => new Promise((resolve, reject) => {
    const types = new RegExp('jpg|jpeg|png');
    const mimes = new RegExp('image/jpeg|image/png');
    const ext = types.test(path.extname(file.originalname).toLowerCase());
    const mime = mimes.test(file.mimetype);
    if (ext && mime) {
        resolve();
    } else reject();
});

/**
 * Validate file type and create media entries in database
 *
 * @param {Object} req Http request
 * @param {Object} file File
 * @param {*} cb Callback
 */
const validateAndCreate = async (req, file, cb) => {
    try {
        await validateFileType(file);
        let fileInfo;
        if (req.body.fileInfo) {
            const fileInfoArr = JSON.parse(req.body.fileInfo);
            fileInfo = fileInfoArr.find((info) => info && info.fileName === file.originalname);
        }
        switch (req.url) {
            case '/key':
                if (req.body.entityId) {
                    const fileName = await createMediaForKey(
                        req.body.entityId,
                        file,
                        fileInfo,
                        req.user,
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `keys/${req.body.entityId}`;
                    cb(null, true);
                } else cb('ERROR: Missing key ID');
                break;
            case '/group':
                if (req.body.entityId) {
                    const fileName = await createMediaForGroup(
                        parseInt(req.body.entityId, 10),
                        file,
                        fileInfo,
                        req.user,
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `groups/${req.body.entityId}`;
                    cb(null, true);
                } else cb('ERROR: Missing group ID');
                break;
            case '/collection':
                if (req.body.entityId) {
                    const fileName = await createMediaForCollection(
                        parseInt(req.body.entityId, 10),
                        file,
                        fileInfo,
                        req.user,
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `collections/${req.body.entityId}`;
                    cb(null, true);
                } else cb('ERROR: Missing collection ID');
                break;
            case '/taxon':
                if (req.body.keyId && req.body.entityId && req.body.revisionId) {
                    const fileName = await createMediaForEntity(
                        req.body,
                        file,
                        fileInfo,
                        req.user,
                        'taxa',
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `keys/${req.body.keyId}/taxa/${req.body.entityId}`;
                    cb(null, true);
                } else cb('ERROR: Missing key and/or taxon ID');
                break;
            case '/character':
                if (req.body.keyId && req.body.entityId && req.body.revisionId) {
                    const fileName = await createMediaForEntity(
                        req.body,
                        file,
                        fileInfo,
                        req.user,
                        'characters',
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `keys/${req.body.keyId}/characters/${req.body.entityId}`;
                    cb(null, true);
                } else cb('ERROR: Missing key and/or character ID');
                break;
            case '/state':
                if (req.body.keyId && req.body.entityId
                    && req.body.stateId && req.body.revisionId) {
                    const fileName = await createMediaForState(
                        req.body,
                        file,
                        fileInfo,
                        req.user,
                    );
                    file.mediaFileName = fileName;
                    file.mediaPath = `keys/${req.body.keyId}/characters/${req.body.entityId}/states/${req.body.stateId}`;
                    cb(null, true);
                } else cb('ERROR: Missing key, character and/or state ID');
                break;
            default:
                cb('ERROR: Unknown URL path');
                break;
        }
    } catch (err) {
        logError('Could not validate or create media', err);
        cb('ERROR: Could not validate or create media');
    }
};

// Set upload config
const config = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) },
    fileFilter: (req, file, cb) => validateAndCreate(req, file, cb),
}).array('files');

/**
 * Save file
 */
const upload = (req, res, next) => {
    config(req, res, (err) => {
        if (err) {
            logError('Could not handle file upload', err);
            res.sendStatus(500);
        } else next();
    });
};

export default upload;
