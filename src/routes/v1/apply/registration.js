import { createRegistration } from '#application/form-submissions/create-registration-and-accreditation.js'
import { parseRegistrationSubmission } from '#domain/form-submissions/parse-submission.js'
import { registrationAndAccreditationHandler } from './handler.js'
import { validateApplyPayload } from './validate-payload.js'

const registrationPath = '/v1/apply/registration'

/**
 * Apply: Registration
 * Stores registration data an activity/site/material combinations against an orgId and referenceNumber.
 */
const registration = {
  method: 'POST',
  path: registrationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      payload: validateApplyPayload(parseRegistrationSubmission)
    }
  },
  handler: registrationAndAccreditationHandler(
    registrationPath,
    createRegistration
  )
}

export { registration, registrationPath }
