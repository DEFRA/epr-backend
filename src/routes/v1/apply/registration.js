import { registrationAndAccreditationHandler } from '#common/helpers/apply/handler.js'
import { registrationAndAccreditationPayload } from '#common/helpers/apply/payload.js'
import { registrationFactory } from '#common/helpers/collections/factories/index.js'

const registrationPath = '/v1/apply/registration'

/**
 * Apply: Registration
 * Stores registration data an activity/site/material combinations against an orgId and referenceNumber.
 */
const registration = {
  method: 'POST',
  path: registrationPath,
  options: {
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
