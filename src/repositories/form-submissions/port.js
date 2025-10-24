/**
 * @typedef {Object} FormSubmission
 * @property {string} _id - MongoDB document ID
 * @property {number} schemaVersion - Schema version
 * @property {Date} createdAt - Creation timestamp
 * @property {number} orgId - Organisation ID
 * @property {string} orgName - Organisation name
 * @property {string} email - Submitter email
 * @property {Array} answers - Form answers
 * @property {Object} rawSubmissionData - Raw form submission data
 */

/**
 * @typedef {Object} FormSubmissionsRepository
 * @property {() => Promise<FormSubmission[]>} findAll - Find all form submissions
 */

/**
 * @typedef {(logger: any) => FormSubmissionsRepository} FormSubmissionsRepositoryFactory
 */
