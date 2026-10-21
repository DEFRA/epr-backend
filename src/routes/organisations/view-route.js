import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

export const organisationPath = '/organisations/{organisationNumber}'
export const yearsPath = `${organisationPath}/years`
export const registrationPath = `${organisationPath}/registrations/{registrationNumber}`
export const accreditationPath = `${registrationPath}/accreditations/{year}`

/** @typedef {{ organisationNumber: string }} OrganisationParams */
/** @typedef {OrganisationParams & { registrationNumber: string }} RegistrationParams */

export const organisationParams = {
  organisationNumber: Joi.string()
    .pattern(/^[1-9]\d*$/)
    .required()
}
export const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string().required()
}

/**
 * @template [Q=object]
 * @typedef {HapiRequest & {
 *   organisationReadRepository: OrganisationReadRepository,
 *   params: OrganisationParams,
 *   query: Q
 * }} ViewRequest
 */

/**
 * The response schemas strip the fields that are not served.
 *
 * @template R
 * @template [Q=object]
 * @param {string} path
 * @param {Joi.Schema} schema
 * @param {(organisation: Organisation, query: Q) => R} select
 * @param {Joi.StrictSchemaMap<Q>} [query]
 */
export const viewRoute = (path, schema, select, query = undefined) => ({
  method: 'GET',
  path,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: {
      params: Joi.object(organisationParams),
      ...(query && { query: Joi.object(query) })
    },
    response: { schema, modify: true, options: { stripUnknown: true } }
  },
  /**
   * @param {ViewRequest<Q>} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation = await findOrganisation(request)
    return h.response(select(organisation, request.query)).code(StatusCodes.OK)
  }
})

/**
 * @param {ViewRequest} request
 * @returns {Promise<Organisation>}
 */
async function findOrganisation(request) {
  const organisation =
    await request.organisationReadRepository.findByOrganisationNumber(
      toOrganisationNumber(request.params.organisationNumber)
    )
  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}
