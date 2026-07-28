/**
 * The reasons a form submission cannot be turned into a record.
 * @typedef {'MISSING_REGULATOR_EMAIL'|'MISSING_EMAIL'|'MISSING_ORG_NAME'|'MISSING_ORG_ID'|'MISSING_REFERENCE_NUMBER'} MissingFieldCode
 */

export const SUBMISSION_REJECTION = Object.freeze({
  MISSING_REGULATOR_EMAIL: 'MISSING_REGULATOR_EMAIL',
  MISSING_EMAIL: 'MISSING_EMAIL',
  MISSING_ORG_NAME: 'MISSING_ORG_NAME',
  MISSING_ORG_ID: 'MISSING_ORG_ID',
  ORG_ID_BELOW_MINIMUM: 'ORG_ID_BELOW_MINIMUM',
  MISSING_REFERENCE_NUMBER: 'MISSING_REFERENCE_NUMBER'
})

/**
 * @typedef {{code: MissingFieldCode, message: string}} MissingFieldRejection
 */

/**
 * Carries the quoted identifiers, which are worth reporting alongside the
 * rejection because they came from the submitter rather than being absent.
 * @typedef {{
 *   code: 'ORG_ID_BELOW_MINIMUM',
 *   message: string,
 *   context: {orgId: number, referenceNumber: string|undefined}
 * }} OrgIdBelowMinimumRejection
 */

/**
 * @typedef {MissingFieldRejection | OrgIdBelowMinimumRejection} SubmissionRejection
 */

/**
 * @param {MissingFieldCode} code
 * @param {string} message
 * @returns {{rejection: MissingFieldRejection}}
 */
export const rejectMissingField = (code, message) => ({
  rejection: { code, message }
})

/**
 * @param {string} message
 * @param {{orgId: number, referenceNumber: string|undefined}} context
 * @returns {{rejection: OrgIdBelowMinimumRejection}}
 */
export const rejectOrgIdBelowMinimum = (message, context) => ({
  rejection: {
    code: SUBMISSION_REJECTION.ORG_ID_BELOW_MINIMUM,
    message,
    context
  }
})
