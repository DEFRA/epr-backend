import Joi from 'joi'

import { CADENCE } from '#reports/domain/cadence.js'
import { periodSchema } from '#reports/repository/schema.js'
import {
  findAccreditationForYear,
  findRegistrationByNumber
} from '#routes/organisations/natural-keys.js'
import {
  accreditationPath,
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { reportsDelete } from './delete.js'
import { reportsGet } from './get.js'
import { reportsGetDetail } from './get-detail.js'
import { reportsPatch } from './patch.js'
import { reportsPost } from './post.js'
import { reportsRequestResubmission } from './request-resubmission.js'
import { reportsStatus } from './status.js'
import { reportsUnsubmit } from './unsubmit.js'
import { submissionNumberSchema, yearSchema } from './shared.js'

/**
 * @import { RouteOptionsValidate } from '@hapi/hapi'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { RegistrationParams } from '#routes/organisations/view-route.js'
 *
 * @typedef {(organisation: Organisation, registration: Registration, year: number) => void} RequireStream
 *
 * @typedef {{
 *   method: string,
 *   options: { validate: RouteOptionsValidate },
 *   handler(request: HapiRequest, h: HapiResponseToolkit): Promise<unknown>
 * }} ReportRoute
 */

/** @type {RequireStream} */
const registeredOnly = () => {}

/** @type {RequireStream} */
const accredited = (organisation, registration, year) => {
  findAccreditationForYear(organisation, registration, year)
}

/**
 * @param {Cadence} cadence
 */
const submissionParams = (cadence) => ({
  ...registrationParams,
  year: yearSchema,
  cadence: Joi.string().valid(cadence).required(),
  period: periodSchema,
  submissionNumber: submissionNumberSchema
})

const streams = [
  {
    path: `${registrationPath}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.quarterly),
    requireStream: registeredOnly
  },
  {
    path: `${accreditationPath}/reports/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.monthly),
    requireStream: accredited
  }
]

/** @type {[ReportRoute, string][]} */
const submissionRoutes = [
  [reportsGetDetail, ''],
  [reportsPost, ''],
  [reportsPatch, ''],
  [reportsDelete, ''],
  [reportsStatus, '/status'],
  [reportsUnsubmit, '/unsubmit'],
  [reportsRequestResubmission, '/request-resubmission']
]

/**
 * Serves an existing report route at a natural-key path. The keys resolve to
 * the stored ids the existing handler reads, so both paths behave the same.
 *
 * @param {ReportRoute} route
 * @param {string} path
 * @param {Joi.PartialSchemaMap} params
 * @param {RequireStream} requireStream
 */
const atNaturalKeys = (route, path, params, requireStream) => ({
  ...route,
  path,
  options: {
    ...route.options,
    validate: { ...route.options.validate, params: Joi.object(params) }
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
    requireStream(organisation, registration, Number(year))

    request.params = {
      ...request.params,
      organisationId: organisation.id,
      registrationId: registration.id
    }
    return route.handler(request, h)
  }
})

export const reportRoutesByNaturalKey = [
  ...streams.flatMap(({ path, params, requireStream }) =>
    submissionRoutes.map(([route, action]) =>
      atNaturalKeys(route, `${path}${action}`, params, requireStream)
    )
  ),
  atNaturalKeys(
    reportsGet,
    `${registrationPath}/reports/calendar`,
    registrationParams,
    registeredOnly
  )
]
