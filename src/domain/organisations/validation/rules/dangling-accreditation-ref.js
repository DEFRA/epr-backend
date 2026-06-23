import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const CODE = 'DANGLING_ACCREDITATION_REF'
const SEVERITY_LEVEL = SEVERITY.ERROR

/**
 * @param {Organisation} org
 * @returns {import('#domain/organisations/validation/issue.js').ValidationIssue[]}
 */
const evaluate = (org) => {
  const accreditationIds = new Set(org.accreditations.map((acc) => acc.id))
  return org.registrations
    .filter(
      (reg) =>
        reg.accreditationId !== undefined &&
        !accreditationIds.has(reg.accreditationId)
    )
    .map((reg) =>
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} references accreditation ${reg.accreditationId}, which does not exist on the organisation`
      })
    )
}

export const danglingAccreditationRefRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
