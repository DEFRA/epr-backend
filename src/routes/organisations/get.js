import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  accreditationViewSchema,
  accreditationsViewResponseSchema,
  organisationViewSchema,
  registrationViewSchema,
  registrationsViewResponseSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

const organisationPath = '/organisations/{organisationNumber}'
const registrationsPath = `${organisationPath}/registrations`
const registrationPath = `${registrationsPath}/{registrationNumber}`
const accreditationsPath = `${registrationPath}/accreditations`
const accreditationPath = `${accreditationsPath}/{year}`

/** @typedef {{ organisationNumber: number }} OrganisationParams */
/** @typedef {OrganisationParams & { registrationNumber: string }} RegistrationParams */
/** @typedef {RegistrationParams & { year: string }} AccreditationParams */

const organisationParams = {
  organisationNumber: Joi.number().integer().positive().required()
}
const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string().required()
}
const accreditationParams = {
  ...registrationParams,
  year: Joi.string()
    .pattern(/^\d{4}$/)
    .required()
}

/**
 * @template {OrganisationParams} P
 * @typedef {HapiRequest & {
 *   organisationReadRepository: OrganisationReadRepository,
 *   params: P
 * }} ViewRequest
 */

/**
 * The response schemas strip the fields that are not served.
 *
 * @template {OrganisationParams} P
 * @template R
 * @param {string} path
 * @param {Joi.StrictSchemaMap<P>} params
 * @param {Joi.Schema} schema
 * @param {(organisation: Organisation, params: P) => R} select
 */
const viewRoute = (path, params, schema, select) => ({
  method: 'GET',
  path,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: { params: Joi.object(params) },
    response: { schema, modify: true, options: { stripUnknown: true } }
  },
  /**
   * @param {ViewRequest<P>} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation = await findOrganisation(request)
    return h.response(select(organisation, request.params)).code(StatusCodes.OK)
  }
})

/**
 * @param {Organisation} organisation
 * @param {RegistrationParams} params
 */
const registration = (organisation, { registrationNumber }) =>
  found(organisation.registrations, registrationNumber, 'Registration')

/**
 * @param {Organisation} organisation
 * @param {RegistrationParams} params
 */
const accreditations = (organisation, params) => ({
  accreditations: registration(organisation, params).accreditations
})

/**
 * @param {Organisation} organisation
 * @param {AccreditationParams} params
 */
const accreditation = (organisation, params) =>
  found(
    registration(organisation, params).accreditations,
    params.year,
    'Accreditation'
  )

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationParams,
  organisationViewSchema,
  (organisation) => organisation
)

export const registrationsViewGet = viewRoute(
  registrationsPath,
  organisationParams,
  registrationsViewResponseSchema,
  (organisation) => ({ registrations: organisation.registrations })
)

export const registrationViewGet = viewRoute(
  registrationPath,
  registrationParams,
  registrationViewSchema,
  registration
)

export const accreditationsViewGet = viewRoute(
  accreditationsPath,
  registrationParams,
  accreditationsViewResponseSchema,
  accreditations
)

export const accreditationViewGet = viewRoute(
  accreditationPath,
  accreditationParams,
  accreditationViewSchema,
  accreditation
)

/**
 * @template T
 * @param {Record<string, T>} record
 * @param {string} key
 * @param {string} what
 * @returns {T}
 */
function found(record, key, what) {
  const value = Object.hasOwn(record, key) ? record[key] : undefined
  if (value === undefined) {
    throw Boom.notFound(`${what} not found`)
  }
  return value
}

/**
 * @param {ViewRequest<OrganisationParams>} request
 * @returns {Promise<Organisation>}
 */
async function findOrganisation(request) {
  const organisation =
    await request.organisationReadRepository.findByOrganisationNumber(
      request.params.organisationNumber
    )
  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}
