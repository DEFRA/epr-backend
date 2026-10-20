import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { NaturalKeyRoute, ResolvedRecords } from './at-natural-keys.js'
 * @import { RegistrationParams } from './view-route.js'
 *
 * @typedef {{ organisationId: string, registrationId: string }} DatabaseIdParams
 *
 * @typedef {{
 *   unknown?(request: HapiRequest, h: HapiResponseToolkit): unknown
 * }} DatabaseIdOptions
 */

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {DatabaseIdParams} params
 * @returns {Promise<{
 *   records: Required<ResolvedRecords>,
 *   naturalKeys: RegistrationParams
 * } | null>}
 */
const findRegistration = async (
  organisationsRepository,
  { organisationId, registrationId }
) => {
  const organisation = await organisationsRepository
    .findById(organisationId)
    .catch((error) => {
      if (Boom.isBoom(error, StatusCodes.NOT_FOUND)) {
        return null
      }
      throw error
    })
  const registration = organisation?.registrations.find(
    ({ id }) => id === registrationId
  )
  if (!organisation || !registration?.registrationNumber) {
    return null
  }
  return {
    records: { organisation, registration },
    naturalKeys: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber
    }
  }
}

/**
 * Serves a route whose handler reads natural keys at a path that names the
 * organisation and registration by their database ids: the reverse of
 * `atNaturalKeys`. The handler gets the organisation and registration
 * numbers in its params, and the records they name on `request.app`, as
 * `ResolvedRecords`. Ids that name no registration, or one with no number
 * yet, answer not found, unless the route gives its own answer for them.
 *
 * @param {NaturalKeyRoute & { path: string }} route
 * @param {DatabaseIdOptions} [options]
 */
export const atDatabaseIds = (route, { unknown } = {}) => ({
  ...route,
  /**
   * @param {HapiRequest & { params: DatabaseIdParams }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const found = await findRegistration(
      request.organisationsRepository,
      request.params
    )
    if (!found) {
      if (unknown) {
        return unknown(request, h)
      }
      throw Boom.notFound('Registration not found')
    }
    Object.assign(request.app, found.records)
    request.params = { ...request.params, ...found.naturalKeys }
    return route.handler(request, h)
  }
})
