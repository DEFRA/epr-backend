import Boom from '@hapi/boom'
import Joi from 'joi'
import {
  idSchema,
  organisationInsertSchema,
  organisationUpdateSchema,
  statusHistoryItemSchema,
  registrationSchema
} from './organisation.js'
import { accreditationSchema } from './accreditation.js'
import { STATUS } from '#domain/organisations/model.js'
import { isAccreditationForRegistration } from '#formsubmission/link-form-submissions.js'

const formatValidationErrorDetails = (error) => {
  return error.details.map((d) => `${d.path.join('.')}: ${d.type}`).join('; ')
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

function isAccreditationMissingApprovedRegistration(
  organisation,
  accreditation
) {
  const hasApprovedRegistration = (organisation.registrations ?? []).some(
    (reg) =>
      reg.accreditationId === accreditation.id &&
      reg.status === STATUS.APPROVED &&
      isAccreditationForRegistration(accreditation, reg)
  )
  return !hasApprovedRegistration
}

function validateApprovedAccreditations(organisation) {
  const approvedAccreditationsWithoutRegistration = (
    organisation.accreditations ?? []
  )
    .filter((acc) => acc.status === STATUS.APPROVED)
    .filter((acc) =>
      isAccreditationMissingApprovedRegistration(organisation, acc)
    )
    .map((acc) => acc.id)

  if (approvedAccreditationsWithoutRegistration.length > 0) {
    throw Boom.badData(
      `Accreditations with id ${approvedAccreditationsWithoutRegistration.join(',')} are approved but not linked to an approved registration`
    )
  }
}

export const validateOrganisationUpdate = (data) => {
  const { error, value } = organisationUpdateSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = formatValidationErrorDetails(error)
    throw Boom.badData(`Invalid organisation data: ${details}`)
  }

  validateApprovedAccreditations(data)
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
