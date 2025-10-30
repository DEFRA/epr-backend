import Boom from '@hapi/boom'
import {
  accreditationSchema,
  registrationSchema,
  organisationSchema
} from './schema.js'

export function validateAccreditation(data) {
  const result = accreditationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: false
  })

  if (result.error) {
    throw Boom.badData(
      `Invalid accreditation data: ${result.error.message}`,
      result.error.details
    )
  }

  return result.value
}

export function validateRegistration(data) {
  const result = registrationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: false
  })

  if (result.error) {
    throw Boom.badData(
      `Invalid registration data: ${result.error.message}`,
      result.error.details
    )
  }

  return result.value
}

export function validateOrganisation(data) {
  const result = organisationSchema.validate(data, {
    abortEarly: false,
    stripUnknown: false
  })

  if (result.error) {
    throw Boom.badData(
      `Invalid organisation data: ${result.error.message}`,
      result.error.details
    )
  }

  return result.value
}
