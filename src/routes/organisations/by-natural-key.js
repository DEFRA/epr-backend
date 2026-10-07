import Joi from 'joi'

import {
  findAccreditationForYear,
  findOrganisationByNumber,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @import { ResponseToolkit, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import {
 *   AccreditationParams,
 *   OrganisationParams,
 *   RegistrationParams
 * } from './view-route.js'
 *
 * @typedef {{
 *   method: string,
 *   options: { validate?: RouteOptionsValidate, [option: string]: unknown },
 *   handler(request: HapiRequest, h: ResponseToolkit | HapiResponseToolkit): Promise<unknown>
 * }} Route
 *
 * @typedef {{ organisationId: string }} OrganisationIds
 * @typedef {OrganisationIds & { registrationId: string }} RegistrationIds
 * @typedef {RegistrationIds & { accreditationId: string }} AccreditationIds
 *
 * @typedef {{ organisation?: Organisation, registration?: Registration }} ResolvedRecords
 */

/**
 * @template {OrganisationParams} P
 * @typedef {(request: HapiRequest & { params: P }) => Promise<Record<string, string>>} ResolveIds
 */

/**
 * Serves an existing route at a natural-key path. The keys resolve to the
 * stored ids the existing handler reads, so both paths behave the same. The
 * records the keys resolved to are on `request.app`, as `ResolvedRecords`, so
 * a handler need not read them again.
 *
 * @template {OrganisationParams} P
 * @param {Route} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {ResolveIds<P>} resolveIds
 */
export const atNaturalKeys = (route, path, params, resolveIds) => ({
  ...route,
  path,
  options: {
    ...route.options,
    validate: { ...route.options.validate, params: Joi.object(params) }
  },
  /**
   * @param {HapiRequest & { params: P }} request
   * @param {ResponseToolkit} h
   */
  handler: async (request, h) => {
    request.params = { ...request.params, ...(await resolveIds(request)) }
    return route.handler(request, h)
  }
})

/**
 * @param {HapiRequest & { params: OrganisationParams }} request
 * @returns {Promise<OrganisationIds>}
 */
export const organisationIds = async ({
  app,
  organisationsRepository,
  params
}) => {
  const organisation = await findOrganisationByNumber(
    organisationsRepository,
    params.organisationNumber
  )
  Object.assign(app, { organisation })
  return { organisationId: organisation.id }
}

/**
 * @param {HapiRequest & { params: RegistrationParams }} request
 * @returns {Promise<RegistrationIds>}
 */
export const registrationIds = async ({
  app,
  organisationsRepository,
  params
}) => {
  const { organisation, registration } = await findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )
  Object.assign(app, { organisation, registration })
  return { organisationId: organisation.id, registrationId: registration.id }
}

/**
 * @param {HapiRequest & { params: AccreditationParams }} request
 * @returns {Promise<AccreditationIds>}
 */
export const accreditationIds = async ({
  app,
  organisationsRepository,
  params
}) => {
  const { organisation, registration } = await findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )
  Object.assign(app, { organisation, registration })
  const accreditation = findAccreditationForYear(
    organisation,
    registration,
    Number(params.year)
  )
  return {
    organisationId: organisation.id,
    registrationId: registration.id,
    accreditationId: accreditation.id
  }
}
