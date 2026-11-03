import { ACTIVE_ACCREDITATION_STATUSES } from '#domain/organisations/model.js'
import {
  SEVERITY,
  accreditationTarget,
  createIssue
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const CODE = 'UNNUMBERED_ACCREDITATION'
const SEVERITY_LEVEL = SEVERITY.ERROR

/**
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const isNumbered = (accreditation) =>
  typeof accreditation.accreditationNumber === 'string' &&
  accreditation.accreditationNumber.trim() !== ''

/**
 * The organisation schema requires a number while an accreditation is approved
 * or suspended, and refuses a write without one. A stored record in either
 * status without a number was written before that rule, or around it.
 *
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) =>
  org.accreditations
    .filter(
      (accreditation) =>
        ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status) &&
        !isNumbered(accreditation)
    )
    .map((accreditation) =>
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: accreditationTarget(accreditation.id),
        message: `Accreditation ${accreditation.id} is approved or suspended but carries no valid accreditation number`
      })
    )

export const unnumberedAccreditationRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
