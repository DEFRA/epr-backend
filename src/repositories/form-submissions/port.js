/**
 * @import {
 *   AccreditationSubmission,
 *   OrganisationSubmission,
 *   RegistrationSubmission
 * } from '#domain/form-submissions/submission-records.js'
 */

/**
 * @typedef {Object} AccreditationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {string} referenceNumber - Reference number
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} RegistrationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {string} referenceNumber - Reference number
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} OrganisationFormSubmission
 * @property {string} id - Document ID
 * @property {number} orgId - Organisation ID
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * Thrown by the insert operations. A store that validates documents against a
 * schema decodes the violated rules into `schemaViolations` so callers can log
 * which fields were rejected without knowing the store's error shape.
 * @typedef {Error & { schemaViolations: string[] }} FormSubmissionInsertError
 */

/**
 * @typedef {Object} FormSubmissionIds
 * @property {Set<string>} organisations - Set of organisation IDs
 * @property {Set<string>} registrations - Set of registration IDs
 * @property {Set<string>} accreditations - Set of accreditation IDs
 */

/**
 * @typedef {Object} FormSubmissionsRepository
 * @property {() => Promise<AccreditationFormSubmission[]>} findAllAccreditations
 * @property {(id: string) => Promise<AccreditationFormSubmission | null>} findAccreditationById
 * @property {(id: string) => Promise<AccreditationFormSubmission[]>} findAccreditationsBySystemReference
 * @property {() => Promise<RegistrationFormSubmission[]>} findAllRegistrations
 * @property {(id: string) => Promise<RegistrationFormSubmission | null>} findRegistrationById
 * @property {(id: string) => Promise<RegistrationFormSubmission[]>} findRegistrationsBySystemReference
 * @property {() => Promise<OrganisationFormSubmission[]>} findAllOrganisations - Find all organisations
 * @property {(id: string) => Promise<OrganisationFormSubmission | null>} findOrganisationById
 * @property {() => Promise<FormSubmissionIds>} findAllFormSubmissionIds - Find all form submission IDs
 * @property {() => Promise<number>} allocateOrgId - Reserve the next organisation ID; no two callers ever receive the same one
 * @property {(submission: OrganisationSubmission) => Promise<string>} insertOrganisation - Store an organisation submission, returning its reference number
 * @property {(submission: RegistrationSubmission) => Promise<void>} insertRegistration
 * @property {(submission: AccreditationSubmission) => Promise<void>} insertAccreditation
 */

/**
 * @typedef {() => FormSubmissionsRepository} FormSubmissionsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
