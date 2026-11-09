import Boom from '@hapi/boom'
import Joi from 'joi'

import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { normalisedRegistrationNumberSchema } from '#repositories/organisations/schema/numbers.js'
import { externalAccreditationSchema } from './schema.js'

/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

/**
 * @param {RegistrationNumber} registrationNumber
 * @returns {RegistrationNumber}
 */
export const normaliseRegistrationNumber = (registrationNumber) =>
  toRegistrationNumber(
    Joi.attempt(registrationNumber, normalisedRegistrationNumberSchema)
  )

/**
 * @param {ExternalAccreditation} accreditation
 * @returns {ExternalAccreditation}
 */
export const validateExternalAccreditation = (accreditation) => {
  const { error, value } = externalAccreditationSchema.validate(accreditation, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid external accreditation: ${details}`)
  }

  return value
}
