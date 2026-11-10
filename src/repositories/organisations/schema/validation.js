import Boom from '@hapi/boom'
import Joi from 'joi'
import {
  idSchema,
  organisationInsertSchema,
  organisationReadSchema,
  organisationReplaceSchema,
  storedOrgIdSchema,
  registrationSchema,
  statusHistoryItemSchema
} from './organisation.js'
import { accreditationSchema } from './accreditation.js'
import { collatedUserSchema, linkedDefraOrganisationSchema } from './base.js'

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

/** @param {object} data @param {import('#domain/organisations/model.js').Organisation | null} [existing] */
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

export const validateLinkedDefraOrganisation = (data) => {
  return validateWithSchema(
    linkedDefraOrganisationSchema.required(),
    data,
    'Invalid linked Defra organisation'
  )
}

export const validateUsers = (data) => {
  return validateWithSchema(
    Joi.array().items(collatedUserSchema).required(),
    data,
    'Invalid users'
  )
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
 * @param {unknown} documentId - the stored document's _id, which the error names
 * @param {unknown} value
 * @param {Joi.Schema} schema
 */
const parseStored = (documentId, value, schema) => {
  const { error, value: parsed } = schema.validate(value)

  if (error) {
    throw Boom.badImplementation(
      `Stored organisation ${String(documentId)} is invalid: ${error.message}`
    )
  }

  return parsed
}

/**
 * Parses an organisation document read from the database.
 * Throws when its orgId is not an organisation number, and ensures array
 * fields are never undefined by applying defaults.
 * This is an internal adapter concern - callers receive data matching the port types.
 * @param {{ _id: unknown }} data - Raw document from MongoDB
 * @returns {object} Normalised document with array defaults applied
 */
export const normaliseOrganisationFromDb = (data) =>
  parseStored(data._id, data, organisationReadSchema)

/**
 * Parses an orgId read from the database without the rest of its document.
 * Throws when it is not an organisation number.
 * @param {{ _id: unknown, orgId: unknown }} stored
 * @returns {number}
 */
export const parseStoredOrgId = ({ _id, orgId }) =>
  parseStored(_id, orgId, storedOrgIdSchema.label('orgId'))
