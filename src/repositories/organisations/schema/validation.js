import Boom from '@hapi/boom'
import Joi from 'joi'
import {
  idSchema,
  organisationInsertSchema,
  organisationReadSchema,
  organisationReplaceSchema,
  registrationSchema,
  statusHistoryItemSchema
} from './organisation.js'
import { accreditationSchema } from './accreditation.js'

const formatValidationErrorDetails = (error) => {
  return error.details
    .map((d) => {
      return `${d.path.join('.')}: ${d.type}`
    })
    .join('; ')
}

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
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`Invalid organisation data: ${details}`)
  }

  return value
}

export const validateOrganisationUpdate = (data, existing = null) => {
  const { error, value } = organisationReplaceSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    context: { original: existing }
  })

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`Invalid organisation data: ${details}`)
  }

  return value
}

export const validateStatusHistory = (statusHistory) => {
  const schema = Joi.array().items(statusHistoryItemSchema).min(1).required()
  const { error, value } = schema.validate(statusHistory)

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badImplementation(
      `Invalid statusHistory: ${details}. This is a system error.`
    )
  }

  return value
}

export const validateRegistration = (data) => {
  const { error, value } = registrationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`Invalid registration data: ${details}`)
  }

  return value
}

export const validateAccreditation = (data) => {
  const { error, value } = accreditationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`Invalid accreditation data: ${details}`)
  }

  return value
}

/**
 * Normalises an organisation document read from the database.
 * Ensures array fields are never undefined by applying defaults.
 * This is an internal adapter concern - callers receive data matching the port types.
 * @param {object} data - Raw document from MongoDB
 * @returns {object} Normalised document with array defaults applied
 */
export const normaliseOrganisationFromDb = (data) => {
  const { value } = organisationReadSchema.validate(data)
  return value
}
