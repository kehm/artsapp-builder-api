/**
 * Set vernacular names and descriptions
 *
 * @param {Object} body Request body
 * @returns {Object} Vernacular names and descriptions
 */
export const setTaxonInfo = (body) => {
    let vernacularName;
    let description;
    if (body.vernacularNameNo || body.vernacularNameEn) {
        vernacularName = {
            no: body.vernacularNameNo || undefined,
            en: body.vernacularNameEn || undefined,
        };
    }
    if (body.descriptionNo || body.descriptionEn) {
        description = {
            no: body.descriptionNo || undefined,
            en: body.descriptionEn || undefined,
        };
    }
    return { vernacularName, description };
};

/**
 * Find taxon from array by ID
 *
 * @param {Array} arr Taxa array
 * @param {int} id Taxon ID
 * @param {boolean} include True if include parentId in object
 * @returns
 */
export const findTaxonById = (arr, id, include) => {
    let taxon;
    if (arr) {
        arr.forEach((element) => {
            if (element.id === id) {
                taxon = element;
            } else if (element.children) {
                const tmp = findTaxonById(element.children, id);
                if (tmp) {
                    taxon = tmp;
                    if (include) taxon.parentId = element.id;
                }
            }
        });
    }
    return taxon;
};

/**
 * Find taxon from array by scientific name
 *
 * @param {Array} arr Taxa array
 * @param {string} name Scientific name
 * @param {int} ignoreId Taxon ID of object to ignore
 * @returns {Object} Taxon
 */
export const findTaxonByName = (arr, name, ignoreId) => {
    let taxon;
    if (arr) {
        arr.forEach((element) => {
            if (element.scientificName.toUpperCase() === name.toUpperCase()) {
                taxon = element;
            } else if (element.children) {
                const tmp = findTaxonByName(element.children, name);
                if (tmp) taxon = tmp;
            }
        });
    }
    if (ignoreId && taxon && (taxon.id === ignoreId)) taxon = undefined;
    return taxon;
};

/**
 * Add taxon to parent taxon
 *
 * @param {Array} taxa Taxa list
 * @param {Object} taxon Taxon
 * @param {int} parentId Parent taxon ID
 */
export const addToParent = (taxa, taxon, parentId) => {
    const parent = findTaxonById(taxa, `${parentId}`);
    if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(taxon);
    }
};

/**
 * Modify taxon names in both languages
 *
 * @param {Object} taxon Taxon to modify
 * @param {int} taxonId Taxon ID
 * @param {Array} taxa Taxa array
 * @param {Object} body Request body
 * @returns {boolean} True if valid
 */
export const modifyTaxonNames = (taxon, taxonId, taxa, body) => {
    let valid = true;
    if (body.scientificName) {
        if (findTaxonByName(taxa, body.scientificName, taxonId)) {
            valid = false;
        } else taxon.scientificName = body.scientificName;
    }
    if (body.vernacularNameNo) {
        if (taxon.vernacularName) {
            taxon.vernacularName.no = body.vernacularNameNo;
        } else taxon.vernacularName = { no: body.vernacularNameNo };
    }
    if (body.vernacularNameEn) {
        if (taxon.vernacularName) {
            taxon.vernacularName.en = body.vernacularNameEn;
        } else taxon.vernacularName = { en: body.vernacularNameEn };
    }
    if (body.descriptionNo) {
        if (taxon.description) {
            taxon.description.no = body.descriptionNo;
        } else taxon.description = { no: body.descriptionNo };
    }
    if (body.descriptionEn) {
        if (taxon.description) {
            taxon.description.en = body.descriptionEn;
        } else taxon.description = { en: body.descriptionEn };
    }
    return valid;
};

/**
 * Update parent taxon
 *
 * @param {Object} tmpTaxon Taxon that is being updated
 * @param {int} parentId Parent ID of the taxon being updated
 * @param {Array} taxa Taxa in revision
 * @param {int} taxonId Taxon ID (from database)
 */
export const updateParentTaxon = (tmpTaxon, parentId, taxa, taxonId) => {
    if (tmpTaxon.parentId) {
        const parentTaxon = findTaxonById(taxa, tmpTaxon.parentId);
        parentTaxon.children.splice(parentTaxon.children.findIndex((element) => element.id === `${taxonId}`), 1);
        if (parentId === 0) {
            taxa.push(tmpTaxon);
        } else addToParent(taxa, tmpTaxon, parentId);
    } else if (parentId !== 0) {
        taxa.splice(taxa.findIndex((element) => element.id === `${taxonId}`), 1);
        addToParent(taxa, tmpTaxon, parentId);
    }
};
