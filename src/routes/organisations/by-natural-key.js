import Joi from 'joi'

import {
  findAccreditationForYear,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * PROVISIONAL: stands in for the shared wrapper until its branch is pushed,
 * then is replaced by that file verbatim.
 *
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */

/**
 * @param {any} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {(request: any) => Promise<object>} resolveIds
 */
export const atNaturalKeys = (route, path, params, resolveIds) => ({
  ...route,
  path,
  options: {
    ...route.options,
    validate: { ...route.options.validate, params: Joi.object(params) }
  },
  /**
   * @param {HapiRequest & { params: any }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    request.params = { ...request.params, ...(await resolveIds(request)) }
    return route.handler(request, h)
  }
})

/** @param {any} request */
export const accreditationIds = async (request) => {
  const { organisation, registration } = await findRegistrationByNumber(
    request.organisationsRepository,
    request.params.organisationNumber,
    request.params.registrationNumber
  )
  const accreditation = findAccreditationForYear(
    organisation,
    registration,
    Number(request.params.year)
  )
  return {
    organisationId: organisation.id,
    registrationId: registration.id,
    accreditationId: accreditation.id
  }
}
