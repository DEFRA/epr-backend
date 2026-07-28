import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  extractAnswers,
  extractEmail,
  extractOrgId,
  extractOrgName,
  extractReferenceNumber,
  getRegulatorEmail
} from './extract-answers.js'
import {
  SUBMISSION_REJECTION,
  rejectMissingField,
  rejectOrgIdBelowMinimum
} from './submission-rejection.js'

/** @import { Answer, FormPayload } from './extract-answers.js' */
/** @import { SubmissionRejection } from './submission-rejection.js' */

/**
 * @typedef {Object} OrganisationDetails
 * @property {Answer[]} answers
 * @property {string} email
 * @property {string} orgName
 * @property {object} rawSubmissionData
 * @property {string} regulatorEmail
 */

/**
 * @typedef {Object} RegistrationDetails
 * @property {Answer[]} answers
 * @property {number} orgId
 * @property {object} rawSubmissionData
 * @property {string} referenceNumber
 */

/**
 * @param {FormPayload} data
 * @returns {{submission: OrganisationDetails, rejection?: undefined} | {submission?: undefined, rejection: SubmissionRejection}}
 */
export function parseOrganisationSubmission(data) {
  const answers = extractAnswers(data)
  const email = extractEmail(answers)
  const orgName = extractOrgName(answers)
  const regulatorEmail = getRegulatorEmail(data)

  if (!regulatorEmail) {
    return rejectMissingField(
      SUBMISSION_REJECTION.MISSING_REGULATOR_EMAIL,
      'Could not get regulator name from data'
    )
  }

  if (!email) {
    return rejectMissingField(
      SUBMISSION_REJECTION.MISSING_EMAIL,
      'Could not extract email from answers'
    )
  }

  if (!orgName) {
    return rejectMissingField(
      SUBMISSION_REJECTION.MISSING_ORG_NAME,
      'Could not extract organisation name from answers'
    )
  }

  return {
    submission: {
      answers,
      email,
      orgName,
      rawSubmissionData: data,
      regulatorEmail
    }
  }
}

/**
 * Registrations and accreditations are submitted against an organisation that
 * already exists, so both identify themselves the same way.
 *
 * @param {FormPayload} data
 * @returns {{submission: RegistrationDetails, rejection?: undefined} | {submission?: undefined, rejection: SubmissionRejection}}
 */
export function parseRegistrationSubmission(data) {
  const answers = extractAnswers(data)
  const orgId = extractOrgId(answers)
  const referenceNumber = extractReferenceNumber(answers)

  if (!orgId) {
    return rejectMissingField(
      SUBMISSION_REJECTION.MISSING_ORG_ID,
      'Could not extract orgId from answers'
    )
  }

  if (orgId < ORG_ID_START_NUMBER) {
    return rejectOrgIdBelowMinimum(
      `Organisation ID must be at least ${ORG_ID_START_NUMBER}`,
      { orgId, referenceNumber }
    )
  }

  if (!referenceNumber) {
    return rejectMissingField(
      SUBMISSION_REJECTION.MISSING_REFERENCE_NUMBER,
      'Could not extract referenceNumber from answers'
    )
  }

  return {
    submission: { answers, orgId, rawSubmissionData: data, referenceNumber }
  }
}
