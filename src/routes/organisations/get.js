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

const pathParams = {
  organisationNumber: Joi.number().integer().positive().required(),
  registrationNumber: Joi.string(),
  year: Joi.string().pattern(/^\d{4}$/)
}

/**
 * @typedef {HapiRequest & {
 *   overseasSitesRepository: OverseasSitesRepository,
 *   params: {
 *     organisationNumber: number,
 *     registrationNumber: string,
 *     year: string
 *   }
 * }} ViewRequest
 *
 * Each route reads only the path parameters its own path declares.
 */

/**
 * @param {string} path
 * @param {Joi.Schema} schema
 * @param {(view: OrganisationView, params: ViewRequest['params']) => object} select
 */
const viewRoute = (path, schema, select) => ({
  method: 'GET',
  path,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: { params: Joi.object(pathParams) },
    response: { schema }
  },
  /**
   * @param {ViewRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const view = await loadView(request)
    return h.response(select(view, request.params)).code(StatusCodes.OK)
  }
})

/**
 * @param {OrganisationView} view
 * @param {ViewRequest['params']} params
 */
const registration = (view, { registrationNumber }) =>
  found(view.registrations, registrationNumber, 'Registration')

/**
 * @param {OrganisationView} view
 * @param {ViewRequest['params']} params
 */
const accreditation = (view, params) =>
  found(registration(view, params).accreditations, params.year, 'Accreditation')

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationViewSchema,
  (view) => view
)

export const registrationsViewGet = viewRoute(
  registrationsPath,
  registrationsViewResponseSchema,
  (view) => ({ registrations: view.registrations })
)

export const registrationViewGet = viewRoute(
  registrationPath,
  registrationViewSchema,
  registration
)

export const accreditationsViewGet = viewRoute(
  accreditationsPath,
  accreditationsViewResponseSchema,
  (view, p) => ({ accreditations: registration(view, p).accreditations })
)

export const accreditationViewGet = viewRoute(
  accreditationPath,
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
  if (!Object.hasOwn(record, key)) {
    throw Boom.notFound(`${what} not found`)
  }
  return record[key]
}

/**
 * @param {ViewRequest} request
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
