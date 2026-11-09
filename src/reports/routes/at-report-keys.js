import Boom from '@hapi/boom'
import Joi from 'joi'

import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'

/**
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 * @import { ReportRecords, ReportRequest } from './shared.js'
 *
 * @typedef {{
 *   schema: Joi.Schema,
 *   failAction(request: HapiRequest, h: HapiResponseToolkit, err: Error): unknown,
 *   map(request: ReportRequest, h: HapiResponseToolkit, response: ResponseObject): unknown
 * }} ReportResponse
 *
 * @typedef {{
 *   accredited?: boolean,
 *   before?(request: ReportRequest): void | Promise<void>,
 *   respond?: ReportResponse
 * }} ReportKeyOptions
 */

/**
 * Wraps a report route at a natural-key path. The organisation and registration
 * the numbers name, and on an `accredited` route the accreditation for
 * {year}, are read from the organisation read model into `request.app` as
 * `ReportRecords`. A registered-only route reports under no accreditation.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {ReportKeyOptions} [options]
 */
export const atReportKeys = (
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
   * @param {HapiRequest & { params: RegistrationParams & { year: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation, registration } =
      await findOrganisationAndRegistrationReadModels(request)

    const accreditation = accredited
      ? registration.accreditations[request.params.year]
      : null
    if (accreditation === undefined) {
      throw Boom.notFound('Accreditation not found')
    }

    /** @type {ReportRecords} */
    const records = { organisation, registration, accreditation }
    Object.assign(request.app, records)

    const resolved = /** @type {ReportRequest} */ (
      /** @type {unknown} */ (request)
    )
    await before?.(resolved)
    const response = await route.handler(resolved, h)
    return respond
      ? respond.map(resolved, h, /** @type {ResponseObject} */ (response))
      : response
  }
})
