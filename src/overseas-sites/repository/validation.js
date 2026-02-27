import Boom from '@hapi/boom'

import { overseasSiteInsertSchema, overseasSiteReadSchema } from './schema.js'

export const validateOverseasSiteInsert = (data) => {
  const { error, value } = overseasSiteInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid overseas site data: ${details}`)
  }

  return value
}

export const validateOverseasSiteRead = (data) => {
  const { error, value } = overseasSiteReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(
      `Invalid overseas site document ${data.id}: ${details}`
    )
  }

  return value
}
