import { registrationAndAccreditationPayload } from '#common/helpers/apply/payload.js'
import { registrationAndAccreditationHandler } from '#common/helpers/apply/handler.js'
import { accreditationFactory } from '#common/helpers/collections/factories/index.js'

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
