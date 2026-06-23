import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#domain/organisations/validation/issue.js'
import { findDuplicates } from '#domain/organisations/validation/find-duplicates.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'DUPLICATE_REGISTRATION_ID'
const SEVERITY_LEVEL = SEVERITY.ERROR

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) =>
  findDuplicates(org.registrations.map((reg) => reg.id)).map((id) =>
    createIssue({
      code: CODE,
      severity: SEVERITY_LEVEL,
      target: registrationTarget(id),
      message: `Registration id ${id} is used by more than one registration`
    })
  )

export const duplicateRegistrationIdRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
