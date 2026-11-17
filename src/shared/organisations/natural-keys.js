import Joi from 'joi'

import {
  ORGANISATION_NUMBER_PATTERN,
  REGISTRATION_NUMBER_PATTERN,
  toOrganisationNumber,
  toRegistrationNumber
} from '#shared/organisations/numbers.js'

/**
 * @import { OrganisationNumber, RegistrationNumber } from '#shared/organisations/numbers.js'
 *
 * @typedef {{ organisationNumber: OrganisationNumber }} OrganisationParams
 *
 * @typedef {OrganisationParams & { registrationNumber: RegistrationNumber }} RegistrationParams
 */

export const organisationPath = '/organisations/{organisationNumber}'
export const registrationPath = `${organisationPath}/registrations/{registrationNumber}`
export const accreditationPath = `${registrationPath}/accreditations/{year}`

export const organisationParams = {
  organisationNumber: Joi.string()
    .pattern(ORGANISATION_NUMBER_PATTERN)
    .custom(toOrganisationNumber)
    .required()
}
export const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string()
    .pattern(REGISTRATION_NUMBER_PATTERN)
    .custom(toRegistrationNumber)
    .required()
}
