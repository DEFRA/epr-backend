import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'MATERIAL_MISMATCH'
const SEVERITY_LEVEL = SEVERITY.WARNING

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) => {
  const accreditationsById = new Map(
    org.accreditations.map((acc) => [acc.id, acc])
  )
  /** @type {import('#domain/organisations/validation/issue.js').ValidationIssue[]} */
  const issues = []
  for (const reg of org.registrations) {
    if (reg.accreditationId === undefined) {
      continue
    }
    const accreditation = accreditationsById.get(reg.accreditationId)
    if (accreditation === undefined) {
      continue
    }
    if (reg.material === accreditation.material) {
      continue
    }
    issues.push(
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} material ${reg.material} does not match linked accreditation ${accreditation.id} material ${accreditation.material}`
      })
    )
  }
  return issues
}

export const materialMismatchRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
