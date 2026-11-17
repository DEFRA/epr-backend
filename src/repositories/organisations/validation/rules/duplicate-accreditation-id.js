import {
  SEVERITY,
  createIssue,
  accreditationTarget
} from '#repositories/organisations/validation/issue.js'
import { findDuplicates } from '#repositories/organisations/validation/find-duplicates.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'DUPLICATE_ACCREDITATION_ID'
const SEVERITY_LEVEL = SEVERITY.ERROR

/**
 * @param {Organisation} org
 * @returns {import('#repositories/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) =>
  findDuplicates(org.accreditations.map((acc) => acc.id)).map((id) =>
    createIssue({
      code: CODE,
      severity: SEVERITY_LEVEL,
      target: accreditationTarget(id),
      message: `Accreditation id ${id} is used by more than one accreditation`
    })
  )

export const duplicateAccreditationIdRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
