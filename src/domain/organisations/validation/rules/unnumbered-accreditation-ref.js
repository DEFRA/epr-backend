import { ACTIVE_ACCREDITATION_STATUSES } from '#domain/organisations/model.js'
import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

const CODE = 'UNNUMBERED_ACCREDITATION_REF'
const SEVERITY_LEVEL = SEVERITY.ERROR

/**
 * An accreditation is numbered only while approved or suspended, so a
 * registration linked to one still awaiting a decision is the ordinary case.
 * The status history is what separates the two: an accreditation that reached
 * an active status was numbered at that point, and a number missing afterwards
 * means the value was lost rather than never issued.
 *
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const hasBeenAccredited = (accreditation) =>
  accreditation.statusHistory.some((entry) =>
    ACTIVE_ACCREDITATION_STATUSES.has(entry.status)
  )

/**
 * @param {Accreditation} accreditation
 * @returns {boolean}
 */
const isNumbered = (accreditation) =>
  typeof accreditation.accreditationNumber === 'string' &&
  accreditation.accreditationNumber.trim() !== ''

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) => {
  const accreditationsById = new Map(
    org.accreditations.map((acc) => [acc.id, acc])
  )

  return org.registrations.flatMap((reg) => {
    const accreditation =
      reg.accreditationId === undefined
        ? undefined
        : accreditationsById.get(reg.accreditationId)

    if (
      !accreditation ||
      !hasBeenAccredited(accreditation) ||
      isNumbered(accreditation)
    ) {
      return []
    }

    return [
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} references accreditation ${accreditation.id}, which has been accredited but carries no valid accreditation number`
      })
    ]
  })
}

export const unnumberedAccreditationRefRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
