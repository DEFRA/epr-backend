import { ACTIVE_ACCREDITATION_STATUSES } from '#domain/organisations/model.js'
import { isNumberedAccreditation } from '#domain/organisations/registration-utils.js'
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
 * An accreditation must carry a number while approved or suspended, and a
 * registration is linked to one before it is approved, so a registration
 * linked to an unnumbered accreditation still awaiting a decision is the
 * ordinary case. The status history separates the two: an accreditation that
 * reached an active status was numbered at that point, so a number missing
 * afterwards means the value was lost rather than never issued.
 *
 * The history is evidence, not proof: the admin editor accepts a corrected
 * status on a stored entry, so an edit that replaces the active entry with one
 * the transition rules also allow silences this rule for that accreditation.
 *
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const hasBeenAccredited = (accreditation) =>
  accreditation.statusHistory.some((entry) =>
    ACTIVE_ACCREDITATION_STATUSES.has(entry.status)
  )

/**
 * The number is a property of the accreditation, and the reports that fail on
 * a missing one reach the accreditation through the identifiers recorded on a
 * PRN rather than through the registration that links to it. An accreditation
 * a registration has since been pointed away from keeps its PRNs and still
 * breaks those reports, so the accreditation is what this rule walks.
 *
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) =>
  org.accreditations
    .filter(
      (accreditation) =>
        hasBeenAccredited(accreditation) &&
        !isNumberedAccreditation(accreditation)
    )
    .map((accreditation) =>
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: accreditationTarget(accreditation.id),
        message: `Accreditation ${accreditation.id} has been accredited but carries no valid accreditation number`
      })
    )

export const unnumberedAccreditationRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
