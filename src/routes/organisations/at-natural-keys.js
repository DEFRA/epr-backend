import Joi from 'joi'

import {
  findAccreditationForYear,
  findOrganisationByNumber,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @import { ResponseObject, ResponseToolkit, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { OrganisationParams, RegistrationParams } from './natural-keys.js'
 *
 * @typedef {{
 *   method: string,
 *   options: { validate?: RouteOptionsValidate, [option: string]: unknown },
 *   handler(request: HapiRequest, h: ResponseToolkit | HapiResponseToolkit): Promise<unknown>
 * }} NaturalKeyRoute
 *
 * @typedef {RegistrationParams & {
 *   year?: Year,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null,
 *   accreditationNumber?: AccreditationNumber | null
 * }} ResolvedParams
 *
 * @typedef {HapiRequest & { params: ResolvedParams }} ResolvedRequest
 *
 * @typedef {{ organisation: Organisation }} ResolvedRecords
 *
 * @typedef {ResolvedRecords & { registration?: Registration }} ResolvedOrginisationAndRegistration
 *
 * @typedef {KeyedResponse<ResolvedRequest>} NaturalKeyResponse
 *
 * @typedef {KeyedOptions<ResolvedRequest> & { accredited?: boolean }} NaturalKeyOptions
 */

/**
 * How a route at natural keys answers, as the request its keys resolved to.
 *
 * @template R
 * @typedef {{
 *   schema: Joi.Schema,
 *   failAction(request: HapiRequest, h: HapiResponseToolkit, err: Error): unknown,
 *   map(request: R, h: HapiResponseToolkit, response: ResponseObject): unknown
 * }} KeyedResponse
 */

/**
 * @template R
 * @typedef {{
 *   before?(request: R): void | Promise<void>,
 *   respond?: KeyedResponse<R>
 * }} KeyedOptions
 */

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OrganisationParams} params
 * @returns {Promise<ResolvedOrginisationAndRegistration>}
 */
const resolveOrganisation = async (organisationsRepository, params) => ({
  organisation: await findOrganisationByNumber(
    organisationsRepository,
    params.organisationNumber
  )
})

/**
 * Throws if the path's keys don't resolve to a registration
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {RegistrationParams} params
 * @returns {Promise<ResolvedOrginisationAndRegistration>}
 */
const resolveRegistration = (organisationsRepository, params) =>
  findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )

/**
 * Wraps a route at a natural-key path. `resolve` reads what the keys name onto
 * the request before `before` and the route's handler see it; a key naming
 * nothing is not found.
 *
 * @template R
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {(request: HapiRequest & { params: RegistrationParams & { year?: Year } }) => Promise<R>} resolve
 * @param {KeyedOptions<R>} [options]
 */
export const atKeys = (
  route,
  path,
  params,
  resolve,
  { before, respond } = {}
) => ({
  ...route,
  path,
  options: {
    ...route.options,
    validate: { ...route.options.validate, params: Joi.object(params) },
    ...(respond && {
      response: { schema: respond.schema, failAction: respond.failAction }
    })
  },
  /**
   * @param {HapiRequest & { params: RegistrationParams & { year?: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const resolved = await resolve(request)
    await before?.(resolved)
    const response = await route.handler(
      /** @type {HapiRequest} */ (/** @type {unknown} */ (resolved)),
      h
    )
    return respond
      ? respond.map(resolved, h, /** @type {ResponseObject} */ (response))
      : response
  }
})

/**
 * Wraps a route at a natural-key path, resolving
 * - {organisationNumber} to `request.params.organisationId`
 * - {registrationNumber} (if present) to `request.params.registrationId`
 * - {registrationNumber} + {year} to `request.params.accreditationId` and
 *   `request.params.accreditationNumber` if the `accredited` option is true
 *
 * The organisation the {organisationNumber} key resolved to is added to `request.app`, as
 * `ResolvedRecords`, so a handler need not read it again.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {NaturalKeyOptions} [options]
 */
export const atNaturalKeys = (
  route,
  path,
  params,
  { accredited = false, ...options } = {}
) => {
  const resolveRecords =
    'registrationNumber' in params ? resolveRegistration : resolveOrganisation

  return atKeys(
    route,
    path,
    params,
    async (request) => {
      const { organisation, registration } = await resolveRecords(
        request.organisationsRepository,
        request.params
      )

      /** @type {ResolvedRecords} */
      const resolvedRecords = { organisation }
      Object.assign(request.app, resolvedRecords)

      const accreditation =
        registration && accredited
          ? findAccreditationForYear(
              organisation,
              registration,
              /** @type {Year} */ (request.params.year)
            )
          : null
      const ids = registration
        ? {
            organisationId: organisation.id,
            registrationId: registration.id,
            accreditationId: accreditation?.id ?? null,
            ...(accreditation && {
              accreditationNumber: accreditation.accreditationNumber
            })
          }
        : { organisationId: organisation.id }

      const resolved = /** @type {ResolvedRequest} */ (request)
      // An organisation route's handler reads the organisation id alone.
      resolved.params = /** @type {ResolvedParams} */ ({
        ...request.params,
        ...ids
      })
      return resolved
    },
    options
  )
}
