/**
 * @typedef {'warning'|'error'} IssueSeverity
 */

export const SEVERITY = Object.freeze({
  WARNING: 'warning',
  ERROR: 'error'
})

/**
 * @typedef {'organisation'|'registration'|'accreditation'} IssueTargetType
 */

export const TARGET_TYPE = Object.freeze({
  ORGANISATION: 'organisation',
  REGISTRATION: 'registration',
  ACCREDITATION: 'accreditation'
})

/**
 * @typedef {{ type: IssueTargetType, id: string }} IssueTarget
 */

/**
 * @typedef {{
 *   code: string,
 *   severity: IssueSeverity,
 *   target: IssueTarget,
 *   message: string
 * }} ValidationIssue
 */

/**
 * @param {string} id
 * @returns {IssueTarget}
 */
export const registrationTarget = (id) => ({
  type: TARGET_TYPE.REGISTRATION,
  id
})

/**
 * @param {string} id
 * @returns {IssueTarget}
 */
export const accreditationTarget = (id) => ({
  type: TARGET_TYPE.ACCREDITATION,
  id
})

/**
 * @param {{ code: string, severity: IssueSeverity, target: IssueTarget, message: string }} issue
 * @returns {ValidationIssue}
 */
export const createIssue = ({ code, severity, target, message }) => ({
  code,
  severity,
  target,
  message
})
