import Boom from '@hapi/boom'

import { atKeys } from '#routes/organisations/at-natural-keys.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'

/**
 * @import Joi from 'joi'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { KeyedOptions, KeyedResponse, NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { ReportRecords, ReportRequest } from './shared.js'
 *
 * @typedef {KeyedResponse<ReportRequest>} ReportResponse
 *
 * @typedef {KeyedOptions<ReportRequest> & { accredited?: boolean }} ReportKeyOptions
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
  { accredited = false, ...options } = {}
) =>
  atKeys(
    route,
    path,
    params,
    async (request) => {
      const { organisation, registration } =
        await findOrganisationAndRegistrationReadModels(request)

      const accreditation = accredited
        ? registration.accreditations[/** @type {Year} */ (request.params.year)]
        : null
      if (accreditation === undefined) {
        throw Boom.notFound('Accreditation not found')
      }

      /** @type {ReportRecords} */
      const records = { organisation, registration, accreditation }
      Object.assign(request.app, records)

      return /** @type {ReportRequest} */ (/** @type {unknown} */ (request))
    },
    options
  )
