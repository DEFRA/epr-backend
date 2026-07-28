import { createAccreditation } from '#application/form-submissions/create-registration-and-accreditation.js'
import { parseRegistrationSubmission } from '#domain/form-submissions/parse-submission.js'
import { registrationAndAccreditationHandler } from './handler.js'
import { validateApplyPayload } from './validate-payload.js'

export const accreditationPath = '/v1/apply/accreditation'

/**
 * Apply: Accreditation
 * Stores accreditation data an activity/site/material combinations against an orgId and referenceNumber.
 */
export const accreditation = {
  method: 'POST',
  path: accreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      payload: validateApplyPayload(parseRegistrationSubmission)
    }
  },
  handler: registrationAndAccreditationHandler(
    accreditationPath,
    createAccreditation
  )
}
