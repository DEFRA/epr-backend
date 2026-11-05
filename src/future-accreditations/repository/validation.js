import Boom from '@hapi/boom'

import { futureAccreditationSchema } from './schema.js'

/** @import { FutureAccreditation } from './port.js' */

/**
 * @param {FutureAccreditation} accreditation
 * @returns {FutureAccreditation}
 */
export const validateFutureAccreditation = (accreditation) => {
  const { error, value } = futureAccreditationSchema.validate(accreditation, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid future accreditation: ${details}`)
  }

  return value
}
