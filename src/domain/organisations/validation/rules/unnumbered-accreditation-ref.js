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

    if (!accreditation || isNumbered(accreditation)) {
      return []
    }

    return [
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} references accreditation ${accreditation.id}, which carries no accreditation number`
      })
    ]
  })
}

export const unnumberedAccreditationRefRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
