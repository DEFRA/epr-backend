import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

export const organisationPath = '/organisations/{organisationNumber}'
export const yearsPath = `${organisationPath}/years`
export const registrationPath = `${organisationPath}/registrations/{registrationNumber}`
export const accreditationPath = `${registrationPath}/accreditations/{year}`

/** @typedef {{ organisationNumber: number }} OrganisationParams */
/** @typedef {OrganisationParams & { registrationNumber: string }} RegistrationParams */

export const organisationParams = {
  organisationNumber: Joi.number().integer().positive().required()
}
export const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string().required()
}

/**
 * @typedef {HapiRequest & {
 *   organisationReadRepository: OrganisationReadRepository,
 *   params: OrganisationParams
 * }} ViewRequest
 */

/**
 * The response schemas strip the fields that are not served.
 *
 * @template R
 * @param {string} path
 * @param {Joi.Schema} schema
 * @param {(organisation: Organisation) => R} select
 */
export const viewRoute = (path, schema, select) => ({
  method: 'GET',
  path,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: { params: Joi.object(organisationParams) },
    response: { schema, modify: true, options: { stripUnknown: true } }
  },
  /**
   * @param {ViewRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation = await findOrganisation(request)
    return h.response(select(organisation)).code(StatusCodes.OK)
  }
})

/**
 * @param {ViewRequest} request
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
