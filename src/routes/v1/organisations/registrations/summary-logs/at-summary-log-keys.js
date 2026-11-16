import { atKeys } from '#routes/organisations/at-natural-keys.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'

/**
 * @import Joi from 'joi'
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { KeyedOptions, NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 *
 * @typedef {HapiRequest & { params: RegistrationParams }} SummaryLogKeyedRequest
 */

/**
 * Wraps a summary-log route at a registration's natural-key path. A path
 * naming no registration in the organisation read model is not found.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {KeyedOptions<SummaryLogKeyedRequest>} [options]
 */
export const atSummaryLogKeys = (route, path, params, options) =>
  atKeys(
    route,
    path,
    params,
    async (request) => {
      await findOrganisationAndRegistrationReadModels(request)
      return request
    },
    options
  )
