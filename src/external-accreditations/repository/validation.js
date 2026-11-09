import Boom from '@hapi/boom'

import { externalAccreditationSchema } from './schema.js'

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

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
