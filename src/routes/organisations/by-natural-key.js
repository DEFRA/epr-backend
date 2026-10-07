import Joi from 'joi'

import {
  findAccreditationForYear,
  findOrganisationByNumber,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @import { ResponseToolkit, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
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
 */

/**
 * @template {OrganisationParams} P
 * @typedef {(request: HapiRequest & { params: P }) => Promise<Record<string, string>>} ResolveIds
 */

/**
 * Serves an existing route at a natural-key path. The keys resolve to the
 * stored ids the existing handler reads, so both paths behave the same.
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

/** @type {ResolveIds<OrganisationParams>} */
export const organisationIds = async ({ organisationsRepository, params }) => {
  const organisation = await findOrganisationByNumber(
    organisationsRepository,
    params.organisationNumber
  )
  return { organisationId: organisation.id }
}

/** @type {ResolveIds<RegistrationParams>} */
export const registrationIds = async ({ organisationsRepository, params }) => {
  const { organisation, registration } = await findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )
  return { organisationId: organisation.id, registrationId: registration.id }
}

/** @type {ResolveIds<AccreditationParams>} */
export const accreditationIds = async ({ organisationsRepository, params }) => {
  const { organisation, registration } = await findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )
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
