import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { toOrganisationView } from './organisation-view.js'
import {
  accreditationViewSchema,
  accreditationsViewResponseSchema,
  organisationViewSchema,
  registrationViewSchema,
  registrationsViewResponseSchema
} from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationView } from './organisation-view.js' */

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
 *   overseasSitesRepository: OverseasSitesRepository,
 *   params: P
 * }} ViewRequest
 */

/**
 * @template {OrganisationParams} P
 * @template R
 * @param {string} path
 * @param {Joi.StrictSchemaMap<P>} params
 * @param {Joi.Schema} schema
 * @param {(view: OrganisationView, params: P) => R} select
 */
const viewRoute = (path, params, schema, select) => ({
  method: 'GET',
  path,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: { params: Joi.object(params) },
    response: { schema }
  },
  /**
   * @param {ViewRequest<P>} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const view = await loadView(request)
    return h.response(select(view, request.params)).code(StatusCodes.OK)
  }
})

/**
 * @param {OrganisationView} view
 * @param {RegistrationParams} params
 */
const registration = (view, { registrationNumber }) =>
  found(view.registrations, registrationNumber, 'Registration')

/**
 * @param {OrganisationView} view
 * @param {RegistrationParams} params
 */
const accreditations = (view, params) => ({
  accreditations: registration(view, params).accreditations
})

/**
 * @param {OrganisationView} view
 * @param {AccreditationParams} params
 */
const accreditation = (view, params) =>
  found(registration(view, params).accreditations, params.year, 'Accreditation')

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationParams,
  organisationViewSchema,
  (view) => view
)

export const registrationsViewGet = viewRoute(
  registrationsPath,
  organisationParams,
  registrationsViewResponseSchema,
  (view) => ({ registrations: view.registrations })
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
 * @returns {Promise<OrganisationView>}
 */
async function loadView(request) {
  const { organisationsRepository, overseasSitesRepository, logger } = request

  const organisation = await organisationsRepository.findByOrgId(
    request.params.organisationNumber
  )
  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }

  const siteIds = organisation.registrations.flatMap((reg) =>
    Object.values(reg.overseasSites ?? {}).map(
      ({ overseasSiteId }) => overseasSiteId
    )
  )
  const sites = await overseasSitesRepository.findByIds(siteIds)

  return toOrganisationView(
    organisation,
    new Map(sites.map((site) => [site.id, site])),
    (message) => logger.warn({ message })
  )
}
