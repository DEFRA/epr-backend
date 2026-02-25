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
    .map((d) => `${d.path.join('.')}: ${d.message}`)
    .join('; ')
}

const validateWithSchema = (schema, data, errorPrefix, options = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options
  })

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`${errorPrefix}: ${details}`)
  }

  return value
}

export const validateId = (id) => {
  const { error, value } = idSchema.validate(id)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}

export const validateOrganisationInsert = (data) => {
  return validateWithSchema(
    organisationInsertSchema,
    data,
    'Invalid organisation data'
  )
}

export const validateOrganisationUpdate = (data, existing = null) => {
  return validateWithSchema(
    organisationReplaceSchema,
    data,
    'Invalid organisation data',
    { context: { original: existing } }
  )
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
  return validateWithSchema(
    registrationSchema,
    data,
    'Invalid registration data'
  )
}

export const validateAccreditation = (data) => {
  return validateWithSchema(
    accreditationSchema,
    data,
    'Invalid accreditation data'
  )
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
