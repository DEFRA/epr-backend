import {
  SEVERITY,
  createIssue,
  accreditationTarget
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'ORPHAN_ACCREDITATION'
const SEVERITY_LEVEL = SEVERITY.WARNING

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) => {
  const referencedIds = new Set(
    org.registrations.flatMap((reg) =>
      reg.accreditationId === undefined ? [] : [reg.accreditationId]
    )
  )
  return org.accreditations
    .filter((acc) => !referencedIds.has(acc.id))
    .map((acc) =>
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: accreditationTarget(acc.id),
        message: `Accreditation ${acc.id} is not referenced by any registration`
      })
    )
}

export const orphanAccreditationRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
