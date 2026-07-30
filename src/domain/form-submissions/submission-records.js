import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '#common/enums/index.js'

/** @import { Answer } from './extract-answers.js' */

/**
 * @typedef {Object} OrganisationSubmission
 * @property {number} schemaVersion
 * @property {Date} createdAt
 * @property {number} orgId
 * @property {string} orgName
 * @property {string} email
 * @property {string|null} nations
 * @property {Answer[]} answers
 * @property {object} rawSubmissionData
 */

/**
 * @typedef {Object} RegistrationSubmission
 * @property {number} schemaVersion
 * @property {Date} createdAt
 * @property {number} orgId
 * @property {string} referenceNumber
 * @property {Answer[]} answers
 * @property {object} rawSubmissionData
 */

/**
 * @typedef {Object} AccreditationSubmission
 * @property {number} schemaVersion
 * @property {Date} createdAt
 * @property {number} orgId
 * @property {string} referenceNumber
 * @property {Answer[]} answers
 * @property {object} rawSubmissionData
 */

/**
 * @typedef {Object} AgainstOrganisationFields
 * @property {number} orgId
 * @property {string} referenceNumber
 * @property {Answer[]} answers
 * @property {object} rawSubmissionData
 */

const emptySubmission = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

/**
 * @param {{orgId: number, orgName: string, email: string, nations?: string|null, answers: Answer[], rawSubmissionData: object}} fields
 * @returns {OrganisationSubmission}
 */
export function organisationSubmission({
  orgId,
  orgName,
  email,
  nations = null,
  answers,
  rawSubmissionData
}) {
  return deepmerge(emptySubmission, {
    createdAt: new Date(),
    orgId,
    orgName,
    email,
    nations,
    answers,
    rawSubmissionData
  })
}

/**
 * Registrations and accreditations are both filed against an organisation that
 * already holds an orgId, so they carry the same fields.
 *
 * @param {AgainstOrganisationFields} fields
 */
const againstOrganisation = ({
  orgId,
  referenceNumber,
  answers,
  rawSubmissionData
}) =>
  deepmerge(emptySubmission, {
    createdAt: new Date(),
    orgId,
    referenceNumber,
    answers,
    rawSubmissionData
  })

/**
 * @param {AgainstOrganisationFields} fields
 * @returns {RegistrationSubmission}
 */
export const registrationSubmission = (fields) => againstOrganisation(fields)

/**
 * @param {AgainstOrganisationFields} fields
 * @returns {AccreditationSubmission}
 */
export const accreditationSubmission = (fields) => againstOrganisation(fields)
