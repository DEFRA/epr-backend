/**
 * PRN (Packaging Recycling Note) domain model type definitions
 * @see docs/architecture/discovery/pepr-lld.md#PRN
 */

/**
 * @typedef {import('./status.js').PrnStatus} PrnStatus
 */

/**
 * User summary for audit fields
 * @typedef {object} UserSummary
 * @property {string} _id - User ID (ObjectId)
 * @property {string} name - User name
 */

/**
 * User summary with position for authorisation
 * @typedef {object} UserSummaryWithPosition
 * @property {string} _id - User ID (ObjectId)
 * @property {string} organisationId - Organisation ID (ObjectId)
 * @property {string} name - User name
 * @property {string} position - User position in organisation
 */

/**
 * Organisation the PRN is issued to
 * @typedef {object} PrnIssuedToOrganisation
 * @property {string} _id - Organisation ID (ObjectId)
 * @property {string} name - Organisation name
 * @property {string} [tradingName] - Organisation trading name
 */

/**
 * PRN status history entry
 * @typedef {object} PrnStatusVersion
 * @property {PrnStatus} status - PRN status
 * @property {Date} createdAt - Status change timestamp
 * @property {UserSummary|null} createdBy - User who changed status (null for system changes)
 */

/**
 * Packaging Recycling Note entity
 * @typedef {object} Prn
 * @property {string} _id - PRN ID (ObjectId)
 * @property {string} organisationId - Organisation ID (ObjectId)
 * @property {string} registrationId - Registration ID (ObjectId)
 * @property {string} accreditationId - Accreditation ID (ObjectId)
 * @property {number} schemaVersion - Schema version
 * @property {Date} createdAt - Creation timestamp
 * @property {UserSummary} createdBy - User who created the PRN
 * @property {Date|null} updatedAt - Last update timestamp
 * @property {UserSummary|null} updatedBy - User who last updated
 * @property {boolean} isExport - Whether this is an export PRN
 * @property {boolean} isDecemberWaste - Whether this is December waste
 * @property {string} prnNumber - PRN reference number
 * @property {number} accreditationYear - Accreditation year (YYYY)
 * @property {number} tonnage - Tonnage in tonnes
 * @property {string|null} notes - Additional notes (max 200 chars)
 * @property {PrnIssuedToOrganisation|null} issuedTo - Organisation the PRN is issued to
 * @property {Date|null} authorisedAt - Authorisation timestamp
 * @property {UserSummaryWithPosition|null} authorisedBy - User who authorised
 * @property {PrnStatusVersion[]} status - Status history
 */

/**
 * PRN creation payload
 * @typedef {object} PrnCreatePayload
 * @property {string} organisationId - Organisation ID (UUID)
 * @property {string} accreditationId - Accreditation ID (UUID)
 */

/**
 * PRN creation response
 * @typedef {object} PrnCreateResponse
 * @property {string} prnId - Created PRN ID
 */

/**
 * Organisation to issue PRN to (payload format)
 * @typedef {object} IssuedToOrganisationPayload
 * @property {string} id - Organisation ID (UUID)
 * @property {string} name - Organisation name
 * @property {string} [tradingName] - Organisation trading name
 */

/**
 * PRN update payload
 * @typedef {object} PrnUpdatePayload
 * @property {number} [tonnage] - Tonnage in tonnes (two decimal places)
 * @property {IssuedToOrganisationPayload} [issuedToOrganisation] - Organisation to issue PRN to
 * @property {string} [notes] - Additional notes (max 200 chars)
 */

/**
 * PRN status update payload
 * @typedef {object} PrnStatusUpdatePayload
 * @property {PrnStatus} status - New PRN status
 */

export default {}
