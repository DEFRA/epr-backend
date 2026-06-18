import {
  SEVERITY,
  createIssue,
  registrationTarget
} from '#domain/organisations/validation/issue.js'
import {
  getRegAccKey,
  isAccreditationForRegistration
} from '#formsubmission/submission-keys.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration, Accreditation, RegistrationOrAccreditation } from '#formsubmission/types.js' */

const CODE = 'INVALID_ACCREDITATION_LINK'
const SEVERITY_LEVEL = SEVERITY.ERROR

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
      isAccreditationForRegistration(
        /** @type {Accreditation} */ (/** @type {unknown} */ (accreditation)),
        /** @type {Registration} */ (/** @type {unknown} */ (reg))
      )
    ) {
      return []
    }

    return [
      createIssue({
        code: CODE,
        severity: SEVERITY_LEVEL,
        target: registrationTarget(reg.id),
        message: `Registration ${reg.id} (key=${getRegAccKey(/** @type {RegistrationOrAccreditation} */ (/** @type {unknown} */ (reg)))}) is linked to accreditation ${accreditation.id} (key=${getRegAccKey(/** @type {RegistrationOrAccreditation} */ (/** @type {unknown} */ (accreditation)))}) which does not match`
      })
    ]
  })
}

export const invalidAccreditationLinkRule = {
  code: CODE,
  severity: SEVERITY_LEVEL,
  evaluate
}
