import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import { toAccreditationResource } from './accreditation-resource.js'
import { toRegistrationResource } from './registration-resource.js'
import {
  accreditationResponseSchema,
  registrationAccreditationsResponseSchema,
  registrationResponseSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */

export const registrationGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}'

export const registrationAccreditationsGetPath = `${registrationGetPath}/accreditations`

export const registrationAccreditationGetPath = `${registrationAccreditationsGetPath}/{accreditationId}`

const registrationAuth = { scope: [SCOPES.organisationRead] }

export const registrationGet = {
  method: 'GET',
  path: registrationGetPath,
  options: {
    auth: registrationAuth,
    tags: ['api'],
    response: {
      schema: registrationResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)

    return h
      .response(toRegistrationResource(registration, organisation))
      .code(StatusCodes.OK)
  }
}

export const registrationAccreditationsGet = {
  method: 'GET',
  path: registrationAccreditationsGetPath,
  options: {
    auth: registrationAuth,
    tags: ['api'],
    response: {
      schema: registrationAccreditationsResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)

    return h
      .response({
        accreditations: accreditationsForRegistration(
          registration,
          organisation
        ).map(toAccreditationResource)
      })
      .code(StatusCodes.OK)
  }
}

export const registrationAccreditationGet = {
  method: 'GET',
  path: registrationAccreditationGetPath,
  options: {
    auth: registrationAuth,
    tags: ['api'],
    response: {
      schema: accreditationResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: {
   *     organisationId: string,
   *     registrationId: string,
   *     accreditationId: string
   *   }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)

    // Resolved through the registration rather than the organisation, so an
    // accreditation the organisation holds under a different registration is
    // not found at this address.
    const accreditation = accreditationsForRegistration(
      registration,
      organisation
    ).find(({ id }) => id === request.params.accreditationId)

    if (!accreditation) {
      throw Boom.notFound('Accreditation not found')
    }

    return h
      .response(toAccreditationResource(accreditation))
      .code(StatusCodes.OK)
  }
}

/**
 * @param {HapiRequest & {
 *   params: { organisationId: string, registrationId: string }
 * }} request
 * @returns {Promise<{ organisation: Organisation, registration: Registration }>}
 */
async function findRegistration(request) {
  const { organisationsRepository } = request
  const { organisationId, registrationId } = request.params

  const organisation = await organisationsRepository.findById(organisationId)

  const registration = organisation.registrations.find(
    (candidate) => candidate.id === registrationId
  )

  if (!registration) {
    throw Boom.notFound('Registration not found')
  }

  return { organisation, registration }
}
