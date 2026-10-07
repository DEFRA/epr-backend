import Joi from 'joi'

import {
  findAccreditationForYear,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @import { ResponseObject, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { RegistrationParams } from './view-route.js'
 *
 * @typedef {{
 *   method: string,
 *   options: { validate?: RouteOptionsValidate, [option: string]: unknown },
 *   handler(request: HapiRequest, h: HapiResponseToolkit): Promise<unknown>
 * }} NaturalKeyRoute
 *
 * @typedef {RegistrationParams & {
 *   year?: number,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string | null
 * }} ResolvedParams
 *
 * @typedef {HapiRequest & { params: ResolvedParams }} ResolvedRequest
 *
 * @typedef {{
 *   schema: Joi.Schema,
 *   failAction(request: HapiRequest, h: HapiResponseToolkit, err: Error): unknown,
 *   map(request: ResolvedRequest, h: HapiResponseToolkit, response: ResponseObject): unknown
 * }} NaturalKeyResponse
 *
 * @typedef {{
 *   accredited?: boolean,
 *   before?(request: ResolvedRequest): void | Promise<void>,
 *   respond?: NaturalKeyResponse
 * }} NaturalKeyOptions
 */

/**
 * Serves an existing route at a natural-key path. The keys resolve to the
 * stored ids the existing handler reads, so both paths behave the same.
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
  { accredited = false, before, respond } = {}
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
   * @param {HapiRequest & { params: RegistrationParams & { year?: number } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationNumber, registrationNumber, year } = request.params
    const { organisation, registration } = await findRegistrationByNumber(
      request.organisationsRepository,
      organisationNumber,
      registrationNumber
    )
    const accreditationId = accredited
      ? findAccreditationForYear(
          organisation,
          registration,
          /** @type {number} */ (year)
        ).id
      : null

    const resolved = /** @type {ResolvedRequest} */ (request)
    resolved.params = {
      ...request.params,
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId
    }
    await before?.(resolved)
    const response = await route.handler(resolved, h)
    return respond
      ? respond.map(resolved, h, /** @type {ResponseObject} */ (response))
      : response
  }
})
