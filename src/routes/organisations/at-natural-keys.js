import Joi from 'joi'

import { findOrganisationByNumber } from './find-organisation-by-number.js'

/**
 * @import { ResponseObject, ResponseToolkit, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { ManagedOrganisation } from '#repositories/organisations/linking-port.js'
 * @import { OrganisationParams, RegistrationParams } from './natural-keys.js'
 *
 * @typedef {{
 *   method: string,
 *   options: { validate?: RouteOptionsValidate, [option: string]: unknown },
 *   handler(request: HapiRequest, h: ResponseToolkit | HapiResponseToolkit): Promise<unknown>
 * }} NaturalKeyRoute
 *
 * @typedef {OrganisationParams & { organisationId: string }} ResolvedParams
 *
 * @typedef {HapiRequest & { params: ResolvedParams }} ResolvedRequest
 *
 * @typedef {{ storedOrganisation: ManagedOrganisation }} ResolvedRecords
 *
 * @typedef {KeyedResponse<ResolvedRequest>} NaturalKeyResponse
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
 * Wraps a route at an organisation's natural-key path, resolving
 * {organisationNumber} to `request.params.organisationId`.
 *
 * The organisation it resolved to is added to `request.app`, as
 * `ResolvedRecords`, so a handler need not read it again.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {KeyedOptions<ResolvedRequest>} [options]
 */
export const atNaturalKeys = (route, path, params, options) =>
  atKeys(
    route,
    path,
    params,
    async (request) => {
      const organisation = await findOrganisationByNumber(
        request.organisationLinkingRepository,
        request.params.organisationNumber
      )

      /** @type {ResolvedRecords} */
      const resolvedRecords = { storedOrganisation: organisation }
      Object.assign(request.app, resolvedRecords)

      return /** @type {ResolvedRequest} */ (
        Object.assign(request, {
          params: { ...request.params, organisationId: organisation.id }
        })
      )
    },
    options
  )
