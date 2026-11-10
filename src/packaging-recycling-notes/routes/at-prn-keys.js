import Boom from '@hapi/boom'

import { atKeys } from '#routes/organisations/at-natural-keys.js'
import { findOrganisationAndRegistrationReadModels } from '#routes/organisations/natural-keys.js'

/**
 * @import Joi from 'joi'
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { AccreditationNumber } from '#domain/organisations/numbers.js'
 * @import { AccreditationCommon, Organisation, Registration } from '#organisation-read-model/domain/model.js'
 * @import { KeyedOptions, NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 *
 * @typedef {{
 *   organisation: Organisation,
 *   registration: Registration,
 *   accreditation: AccreditationCommon
 * }} PrnRecords
 *
 * @typedef {RegistrationParams & {
 *   year: Year,
 *   accreditationNumber: AccreditationNumber
 * }} PrnKeys
 *
 * @typedef {HapiRequest & { params: PrnKeys, app: PrnRecords }} PrnKeyedRequest
 */

/**
 * Wraps a PRN route at an accreditation's natural-key path. The organisation,
 * registration and the registration's accreditation for {year} are read from
 * the organisation read model into `request.app` as `PrnRecords`, and the
 * accreditation's number is added to the params.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {KeyedOptions<PrnKeyedRequest>} [options]
 */
export const atPrnKeys = (route, path, params, options) =>
  atKeys(
    route,
    path,
    params,
    async (request) => {
      const { organisation, registration } =
        await findOrganisationAndRegistrationReadModels(request)

      const accreditation =
        registration.accreditations[/** @type {Year} */ (request.params.year)]
      if (!accreditation) {
        throw Boom.notFound('Accreditation not found')
      }

      /** @type {PrnRecords} */
      const records = { organisation, registration, accreditation }
      Object.assign(request.app, records)

      const keyed = /** @type {PrnKeyedRequest} */ (
        /** @type {unknown} */ (request)
      )
      keyed.params = {
        ...keyed.params,
        accreditationNumber: accreditation.accreditationNumber
      }
      return keyed
    },
    options
  )
