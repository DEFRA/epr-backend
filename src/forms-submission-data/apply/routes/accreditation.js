import { registrationAndAccreditationPayload } from '#formsubmission/apply/payload.js'
import { registrationAndAccreditationHandler } from '#formsubmission/apply/handler.js'
import { accreditationFactory } from '#formsubmission/apply/collections/factories/index.js'

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
      payload: registrationAndAccreditationPayload
    }
  },
  handler: registrationAndAccreditationHandler(
    'accreditation',
    accreditationPath,
    accreditationFactory
  )
}
