import Boom from '@hapi/boom'

import { accreditationForYear } from '#organisation-read-model/index.js'
import { atKeys } from '#routes/organisations/at-natural-keys.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'

/**
 * @import Joi from 'joi'
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { Registration } from '#organisation-read-model/index.js'
 * @import { KeyedOptions, NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 *
 * @typedef {HapiRequest & {
 *   params: RegistrationParams & { accreditationNumber: AccreditationNumber | null }
 * }} SummaryLogKeyedRequest
 *
 * @typedef {KeyedOptions<SummaryLogKeyedRequest> & { accredited?: boolean }} SummaryLogKeyOptions
 */

/**
 * @param {Registration} registration
 * @param {Year} year
 * @returns {AccreditationNumber}
 */
const accreditationNumberForYear = (registration, year) => {
  const accreditation = accreditationForYear(registration, year)
  if (!accreditation) {
    throw Boom.notFound('Accreditation not found')
  }
  return accreditation.accreditationNumber
}

/**
 * Wraps a summary-log route at a registration's natural-key path. A path
 * naming no registration in the organisation read model is not found. An
 * `accredited` route adds the number of the read model's accreditation for
 * {year} to the params; any other adds `null`.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {SummaryLogKeyOptions} [options]
 */
export const atSummaryLogKeys = (
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
      const { registration } =
        await findOrganisationAndRegistrationReadModels(request)

      const keyed = /** @type {SummaryLogKeyedRequest} */ (request)
      keyed.params = {
        ...request.params,
        accreditationNumber: accredited
          ? accreditationNumberForYear(
              registration,
              /** @type {Year} */ (request.params.year)
            )
          : null
      }
      return keyed
    },
    options
  )
