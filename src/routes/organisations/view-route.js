import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

export const organisationPath = '/organisations/{organisationNumber}'
export const yearsPath = `${organisationPath}/years`
export const registrationsPath = `${organisationPath}/registrations`
export const registrationPath = `${registrationsPath}/{registrationNumber}`
export const accreditationsPath = `${registrationPath}/accreditations`
export const accreditationPath = `${accreditationsPath}/{year}`

/** @typedef {{ organisationNumber: number }} OrganisationParams */
/** @typedef {OrganisationParams & { registrationNumber: string }} RegistrationParams */
/** @typedef {RegistrationParams & { year: string }} AccreditationParams */

export const organisationParams = {
  organisationNumber: Joi.number().integer().positive().required()
}
export const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string().required()
}
export const accreditationParams = {
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
export const viewRoute = (path, params, schema, select) => ({
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
export const registration = (organisation, { registrationNumber }) =>
  found(organisation.registrations, registrationNumber, 'Registration')

/**
 * @template T
 * @param {Record<string, T>} record
 * @param {string} key
 * @param {string} what
 * @returns {T}
 */
export function found(record, key, what) {
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
