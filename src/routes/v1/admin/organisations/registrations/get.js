import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import {
  registrationAccreditationsResponseSchema,
  registrationResponseSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

export const registrationGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}'

export const registrationAccreditationsGetPath = `${registrationGetPath}/accreditations`

// An operator earns `organisation.read` for their own organisation, and these
// routes name one, so that scope alone would admit them to an admin page. See
// REGULATOR_SCOPES for why `organisation.search` is the scope that refuses them
// and still admits every admin tier and the regulator.
const adminAuth = {
  scope: [`+${SCOPES.organisationRead}`, `+${SCOPES.organisationSearch}`]
}

export const registrationGet = {
  method: 'GET',
  path: registrationGetPath,
  options: {
    auth: adminAuth,
    tags: ['api', 'admin'],
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

/**
 * Returns every accreditation whose natural key matches this registration and
 * that no other registration claims. That is a superset of the single
 * accreditation `registration.accreditationId` names, so an accreditation no
 * registration links to - the state ORPHAN_ACCREDITATION reports - appears here
 * when its key matches.
 */
export const registrationAccreditationsGet = {
  method: 'GET',
  path: registrationAccreditationsGetPath,
  options: {
    auth: adminAuth,
    tags: ['api', 'admin'],
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
 * @param {Registration} registration
 * @param {Organisation} organisation
 */
function toRegistrationResource(registration, organisation) {
  return {
    id: registration.id,
    organisationId: organisation.id,
    orgName: registration.orgName,
    registrationNumber: registration.registrationNumber ?? null,
    status: registration.status,
    material: registration.material,
    ...(registration.glassRecyclingProcess && {
      glassRecyclingProcess: registration.glassRecyclingProcess
    }),
    wasteProcessingType: registration.wasteProcessingType,
    reprocessingType: registration.reprocessingType ?? null,
    submittedToRegulator: registration.submittedToRegulator,
    validFrom: registration.validFrom ?? null,
    validTo: registration.validTo ?? null,
    site: registration.site ?? null
  }
}

/**
 * @param {Accreditation} accreditation
 */
function toAccreditationResource(accreditation) {
  return {
    id: accreditation.id,
    orgName: accreditation.orgName,
    accreditationNumber: accreditation.accreditationNumber ?? null,
    status: accreditation.status,
    material: accreditation.material,
    wasteProcessingType: accreditation.wasteProcessingType,
    reprocessingType: accreditation.reprocessingType ?? null,
    submittedToRegulator: accreditation.submittedToRegulator,
    validFrom: accreditation.validFrom ?? null,
    validTo: accreditation.validTo ?? null,
    site: accreditation.site ?? null
  }
}
