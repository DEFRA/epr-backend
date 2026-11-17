import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#repositories/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'MATERIAL_MISMATCH'
const SEVERITY_LEVEL = SEVERITY.WARNING

/**
 * @param {Organisation} org
 * @returns {import('#repositories/organisations/validation/issue.js').ValidationIssue[]}
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
      accreditation === undefined ||
      reg.material === accreditation.material
    ) {
      return []
    }
    return [
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} material ${reg.material} does not match linked accreditation ${accreditation.id} material ${accreditation.material}`
      })
    ]
  })
}

export const materialMismatchRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
