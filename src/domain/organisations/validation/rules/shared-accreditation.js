import {
  SEVERITY,
  createIssue,
  accreditationTarget
} from '#domain/organisations/validation/issue.js'
import { findDuplicates } from '#domain/organisations/validation/find-duplicates.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'SHARED_ACCREDITATION'
const SEVERITY_LEVEL = SEVERITY.WARNING

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) => {
  const referencedIds = org.registrations.flatMap((reg) =>
    reg.accreditationId === undefined ? [] : [reg.accreditationId]
  )
  return findDuplicates(referencedIds).map((id) =>
    createIssue({
      code: CODE,
      severity: SEVERITY_LEVEL,
      target: accreditationTarget(id),
      message: `Accreditation ${id} is shared by more than one registration`
    })
  )
}

export const sharedAccreditationRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
