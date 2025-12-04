import Boom from '@hapi/boom'
import {
  organisationIdSchema,
  registrationIdSchema,
  accreditationIdSchema,
  wasteRecordSchema
} from './schema.js'

export const validateOrganisationId = (organisationId) => {
  const { error, value } = organisationIdSchema.validate(organisationId)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}

export const validateRegistrationId = (registrationId) => {
  const { error, value } = registrationIdSchema.validate(registrationId)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}

export const validateWasteRecord = (wasteRecord) => {
  const { error, value } = wasteRecordSchema.validate(wasteRecord, {
    abortEarly: false,
    stripUnknown: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid waste record: ${details}`)
  }

  return value
}

export const validateAccreditationId = (accreditationId) => {
  const { error, value } = accreditationIdSchema.validate(accreditationId)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}
