import { registrationAndAccreditationHandler } from '#formsubmission/apply/handler.js'
import { registrationAndAccreditationPayload } from '#formsubmission/apply/payload.js'
import { registrationFactory } from '#formsubmission/apply/collections/factories/index.js'

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
      payload: registrationAndAccreditationPayload
    }
  },
  handler: registrationAndAccreditationHandler(
    'registration',
    registrationPath,
    registrationFactory
  )
}

export { registration, registrationPath }
