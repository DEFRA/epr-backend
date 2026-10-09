import Joi from 'joi'

import {
  findAccreditationForYear,
  findOrganisationByNumber,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @import { ResponseObject, ResponseToolkit, RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { OrganisationParams, RegistrationParams } from './view-route.js'
 *
 * @typedef {{
 *   method: string,
 *   options: { validate?: RouteOptionsValidate, [option: string]: unknown },
 *   handler(request: HapiRequest, h: ResponseToolkit | HapiResponseToolkit): Promise<unknown>
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
 * @typedef {{ organisation: Organisation, registration?: Registration }} ResolvedRecords
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
 * @param {OrganisationsRepository} organisationsRepository
 * @param {OrganisationParams} params
 * @returns {Promise<ResolvedRecords>}
 */
const resolveOrganisation = async (organisationsRepository, params) => ({
  organisation: await findOrganisationByNumber(
    organisationsRepository,
    params.organisationNumber
  )
})

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {RegistrationParams} params
 * @returns {Promise<ResolvedRecords>}
 */
const resolveRegistration = (organisationsRepository, params) =>
  findRegistrationByNumber(
    organisationsRepository,
    params.organisationNumber,
    params.registrationNumber
  )

/**
 * Serves an existing route at a natural-key path. The keys resolve to the
 * stored ids the existing handler reads, so both paths behave the same. A
 * path with no registration number resolves the organisation alone. The
 * records the keys resolved to are on `request.app`, as `ResolvedRecords`, so
 * a handler need not read them again.
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
) => {
  const resolveRecords =
    'registrationNumber' in params ? resolveRegistration : resolveOrganisation

  return {
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
      const records = await resolveRecords(
        request.organisationsRepository,
        request.params
      )
      Object.assign(request.app, records)

      const { organisation, registration } = records
      const ids = registration
        ? {
            organisationId: organisation.id,
            registrationId: registration.id,
            accreditationId: accredited
              ? findAccreditationForYear(
                  organisation,
                  registration,
                  /** @type {number} */ (request.params.year)
                ).id
              : null
          }
        : { organisationId: organisation.id }

      const resolved = /** @type {ResolvedRequest} */ (request)
      // An organisation route's handler reads the organisation id alone.
      resolved.params = /** @type {ResolvedParams} */ ({
        ...request.params,
        ...ids
      })
      await before?.(resolved)
      const response = await route.handler(resolved, h)
      return respond
        ? respond.map(resolved, h, /** @type {ResponseObject} */ (response))
        : response
    }
  }
}
