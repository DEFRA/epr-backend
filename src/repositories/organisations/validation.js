import Boom from '@hapi/boom'
import Joi from 'joi'
import {
  idSchema,
  organisationInsertSchema,
  organisationUpdateSchema,
  statusHistoryItemSchema
} from './schema.js'

export const validateId = (id) => {
  const { error, value } = idSchema.validate(id)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}

export const validateOrganisationInsert = (data) => {
  const { error, value } = organisationInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details
      .map((d) => `${d.path.join('.')}: ${d.type}`)
      .join('; ')
    throw Boom.badData(`Invalid organisation data: ${details}`)
  }

  return value
}

export const validateOrganisationUpdate = (data) => {
  const { error, value } = organisationUpdateSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details
      .map((d) => `${d.path.join('.')}: ${d.type}`)
      .join('; ')
    throw Boom.badData(`Invalid organisation data: ${details}`)
  }

  return value
}

export const validateStatusHistory = (statusHistory) => {
  const schema = Joi.array().items(statusHistoryItemSchema).min(1).required()
  const { error, value } = schema.validate(statusHistory)

  if (error) {
    const details = error.details
      .map((d) => `${d.path.join('.')}: ${d.type}`)
      .join('; ')
    throw Boom.badImplementation(
      `Invalid statusHistory: ${details}. This is a system error.`
    )
  }

  return value
}
