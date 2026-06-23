import { danglingAccreditationRefRule } from './dangling-accreditation-ref.js'
import { duplicateAccreditationIdRule } from './duplicate-accreditation-id.js'
import { duplicateRegistrationIdRule } from './duplicate-registration-id.js'
import { sharedAccreditationRule } from './shared-accreditation.js'
import { orphanAccreditationRule } from './orphan-accreditation.js'
import { materialMismatchRule } from './material-mismatch.js'
import { invalidAccreditationLinkRule } from './invalid-accreditation-link.js'

/**
 * @typedef {{
 *   code: string,
 *   severity: import('#domain/organisations/validation/issue.js').IssueSeverity,
 *   evaluate: (org: import('#domain/organisations/model.js').Organisation) =>
 *     import('#domain/organisations/validation/issue.js').ValidationIssue[]
 * }} ValidationRule
 */

/** @type {ValidationRule[]} */
export const rules = [
  danglingAccreditationRefRule,
  duplicateAccreditationIdRule,
  duplicateRegistrationIdRule,
  sharedAccreditationRule,
  orphanAccreditationRule,
  materialMismatchRule,
  invalidAccreditationLinkRule
]
