import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  accreditationsForRegistration,
  resolveDetailedMaterial
} from '#domain/organisations/registration-utils.js'
import {
  toDateRangeResource,
  toRegistrationResource
} from './registration-resource.js'
import {
  registrationAccreditationsResponseSchema,
  registrationResponseSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

export const registrationGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}'

export const registrationAccreditationsGetPath = `${registrationGetPath}/accreditations`

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

/**
 * The accreditation reads its material the way the registration does: the
 * applicant's answer stays in `application`, and the resolved one sits at the
 * top level where it exists at all.
 *
 * @param {Accreditation} accreditation
 */
function toAccreditationResource(accreditation) {
  const material = resolveDetailedMaterial(accreditation)

  return {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber ?? null,
    status: accreditation.status,
    ...(material !== null && { material }),
    reprocessingType: accreditation.reprocessingType ?? null,
    dateRange: toDateRangeResource(accreditation),
    application: {
      orgName: accreditation.orgName,
      submittedToRegulator: accreditation.submittedToRegulator,
      material: accreditation.material,
      wasteProcessingType: accreditation.wasteProcessingType
    }
  }
}
