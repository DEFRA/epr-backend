import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { resolveOverseasSiteDetails } from '#overseas-sites/application/resolve-overseas-site-details.js'
import {
  toAccreditationsView,
  toOrganisationView,
  toRegistrationView
} from './organisation-view.js'
import {
  accreditationViewSchema,
  accreditationsViewResponseSchema,
  organisationViewSchema,
  registrationViewSchema,
  registrationsViewSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const organisationViewGetPath = '/organisations/{organisationNumber}'
export const registrationsViewGetPath = `${organisationViewGetPath}/registrations`
export const registrationViewGetPath = `${registrationsViewGetPath}/{registrationNumber}`
export const accreditationsViewGetPath = `${registrationViewGetPath}/accreditations`
export const accreditationViewGetPath = `${accreditationsViewGetPath}/{year}`

const auth = { scope: [SCOPES.organisationRead, SCOPES.adminRead] }

const organisationParams = {
  organisationNumber: Joi.number().integer().positive().required()
}

const registrationParams = {
  ...organisationParams,
  registrationNumber: Joi.string().required()
}

/**
 * @typedef {HapiRequest & {
 *   overseasSitesRepository: OverseasSitesRepository,
 *   params: { organisationNumber: number }
 * }} OrganisationRequest
 */

/**
 * @typedef {HapiRequest & {
 *   overseasSitesRepository: OverseasSitesRepository,
 *   params: { organisationNumber: number, registrationNumber: string }
 * }} RegistrationRequest
 */

export const organisationViewGet = {
  method: 'GET',
  path: organisationViewGetPath,
  options: {
    auth,
    tags: ['api'],
    validate: { params: Joi.object(organisationParams) },
    response: { schema: organisationViewSchema }
  },
  /**
   * @param {OrganisationRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation = await findOrganisation(request)
    const overseasSites = await resolveOrganisationOverseasSites(
      request.overseasSitesRepository,
      organisation
    )

    return h
      .response(toOrganisationView(organisation, overseasSites))
      .code(StatusCodes.OK)
  }
}

export const registrationsViewGet = {
  method: 'GET',
  path: registrationsViewGetPath,
  options: {
    auth,
    tags: ['api'],
    validate: { params: Joi.object(organisationParams) },
    response: { schema: registrationsViewSchema }
  },
  /**
   * @param {OrganisationRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation = await findOrganisation(request)
    const overseasSites = await resolveOrganisationOverseasSites(
      request.overseasSitesRepository,
      organisation
    )

    return h
      .response({
        registrations: toOrganisationView(organisation, overseasSites)
          .registrations
      })
      .code(StatusCodes.OK)
  }
}

export const registrationViewGet = {
  method: 'GET',
  path: registrationViewGetPath,
  options: {
    auth,
    tags: ['api'],
    validate: { params: Joi.object(registrationParams) },
    response: { schema: registrationViewSchema }
  },
  /**
   * @param {RegistrationRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)
    const overseasSites = await resolveOverseasSiteDetails(
      request.overseasSitesRepository,
      registration.overseasSites
    )

    return h
      .response(toRegistrationView(registration, organisation, overseasSites))
      .code(StatusCodes.OK)
  }
}

export const accreditationsViewGet = {
  method: 'GET',
  path: accreditationsViewGetPath,
  options: {
    auth,
    tags: ['api'],
    validate: { params: Joi.object(registrationParams) },
    response: { schema: accreditationsViewResponseSchema }
  },
  /**
   * @param {RegistrationRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)

    return h
      .response({
        accreditations: toAccreditationsView(registration, organisation)
      })
      .code(StatusCodes.OK)
  }
}

export const accreditationViewGet = {
  method: 'GET',
  path: accreditationViewGetPath,
  options: {
    auth,
    tags: ['api'],
    validate: {
      params: Joi.object({
        ...registrationParams,
        year: Joi.string()
          .pattern(/^\d{4}$/)
          .required()
      })
    },
    response: { schema: accreditationViewSchema }
  },
  /**
   * @param {RegistrationRequest & {
   *   params: { year: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } = await findRegistration(request)
    const accreditation = toAccreditationsView(registration, organisation)[
      request.params.year
    ]

    if (!accreditation) {
      throw Boom.notFound('Accreditation not found')
    }

    return h.response(accreditation).code(StatusCodes.OK)
  }
}

/**
 * @param {OrganisationRequest} request
 * @returns {Promise<Organisation>}
 */
async function findOrganisation(request) {
  const organisation = await request.organisationsRepository.findByOrgId(
    request.params.organisationNumber
  )

  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }

  return organisation
}

/**
 * @param {RegistrationRequest} request
 * @returns {Promise<{ organisation: Organisation, registration: Registration }>}
 */
async function findRegistration(request) {
  const organisation = await findOrganisation(request)
  const registration = organisation.registrations.find(
    (candidate) =>
      candidate.registrationNumber === request.params.registrationNumber
  )

  if (!registration) {
    throw Boom.notFound('Registration not found')
  }

  return { organisation, registration }
}

/**
 * @param {OverseasSitesRepository} overseasSitesRepository
 * @param {Organisation} organisation
 */
async function resolveOrganisationOverseasSites(
  overseasSitesRepository,
  organisation
) {
  const resolved = await Promise.all(
    organisation.registrations.map(async (registration) => [
      registration.id,
      await resolveOverseasSiteDetails(
        overseasSitesRepository,
        registration.overseasSites
      )
    ])
  )

  return Object.fromEntries(resolved)
}
