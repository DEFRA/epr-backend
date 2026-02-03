/**
 * @typedef {Object} PrnUserSummary
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} PrnUserSummaryWithPosition
 * @property {string} id
 * @property {string} organisationId
 * @property {string} name
 * @property {string} position
 */

/**
 * @typedef {Object} PrnIssuedToOrganisation
 * @property {string} id
 * @property {string} name
 * @property {string} [tradingName]
 */

/**
 * @typedef {Object} PrnStatusVersion
 * @property {import('./status.js').PrnStatus} status
 * @property {string} createdAt - ISO8601
 * @property {PrnUserSummary} [createdBy]
 */

/**
 * @typedef {Object} PackagingRecyclingNote
 * @property {string} id
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} accreditationId
 * @property {number} schemaVersion
 * @property {string} createdAt - ISO8601
 * @property {PrnUserSummary} createdBy
 * @property {string} [updatedAt] - ISO8601
 * @property {PrnUserSummary} [updatedBy]
 * @property {boolean} isExport
 * @property {boolean} isDecemberWaste
 * @property {string} [prnNumber]
 * @property {number} accreditationYear - 4 digit year: YYYY
 * @property {number} tonnage
 * @property {string} issuerNotes
 * @property {PrnIssuedToOrganisation} issuedToOrganisation
 * @property {string} [authorisedAt] - ISO8601
 * @property {PrnUserSummaryWithPosition} [authorisedBy]
 * @property {PrnStatusVersion[]} status
 */

/**
 * @typedef {Object} CreateNewPRNRequest
 * @property {number} tonnage
 * @property {string} issuerNotes
 * @property {PrnIssuedToOrganisation} issuedToOrganisation
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
