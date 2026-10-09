import Boom from '@hapi/boom'
import Joi from 'joi'

import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { periodSchema } from '#reports/repository/schema.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
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
import { reportResourceSchema, toReportResource } from './report-resource.js'
import { reportResponseFailAction } from './response-fail-action.js'
import { submissionNumberSchema } from './shared.js'

/**
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { NaturalKeyResponse, NaturalKeyRoute, ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 * @import { PreviewBody, StoredReportBody } from './report-resource.js'
 *
 * @typedef {ResolvedRequest & { params: { submissionNumber: number } }} SubmissionRequest
 * @typedef {StoredReportBody | PreviewBody} ReportDetailBody
 */

/**
 * @param {Cadence} cadence
 */
const submissionParams = (cadence) => ({
  ...registrationParams,
  year: yearSchema().required(),
  cadence: Joi.string().valid(cadence).required(),
  period: periodSchema,
  submissionNumber: submissionNumberSchema
})

const streams = [
  {
    path: `${registrationPath}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.quarterly),
    accredited: false
  },
  {
    path: `${accreditationPath}/reports/{cadence}/{period}/submissions/{submissionNumber}`,
    params: submissionParams(CADENCE.monthly),
    accredited: true
  }
]

/**
 * @param {NaturalKeyResponse['map']} map
 * @returns {NaturalKeyResponse}
 */
const respondWithReport = (map) => ({
  schema: reportResourceSchema,
  failAction: reportResponseFailAction,
  map
})

/**
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 * @param {ReportDetailBody} body
 * @param {number} statusCode
 */
const serveReport = (request, h, body, statusCode) =>
  h
    .response(
      toReportResource(body, {
        submissionNumber: request.params.submissionNumber
      })
    )
    .code(statusCode)

/**
 * Serves the report detail handler's body as the report resource.
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 * @param {ResponseObject} response
 */
const mapDetail = (request, h, response) =>
  serveReport(
    request,
    h,
    /** @type {ReportDetailBody} */ (response.source),
    response.statusCode
  )

/**
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 * @param {ResponseObject} response
 */
const mapCreated = (request, h, response) =>
  serveReport(
    request,
    h,
    /** @type {StoredReportBody} */ ({
      .../** @type {object} */ (response.source),
      canRequestResubmission: false
    }),
    response.statusCode
  )

/**
 * Serves the report as it stands after a command, read the way GET reads it.
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 */
const mapCommand = async (request, h) =>
  mapDetail(
    request,
    h,
    /** @type {ResponseObject} */ (
      await reportsGetDetail.handler(
        /** @type {Parameters<typeof reportsGetDetail.handler>[0]} */ (
          /** @type {unknown} */ (request)
        ),
        h
      )
    )
  )

/**
 * An accredited report covers only periods from the accreditation's start: a
 * period ending before it is not found.
 *
 * @param {ResolvedRequest & { params: { cadence: Cadence, period: number } }} request
 */
const assertPeriodWithinAccreditation = async (request) => {
  const { organisationId, accreditationId, year, cadence, period } =
    request.params
  const { validFrom } =
    await request.organisationsRepository.findAccreditationById(
      organisationId,
      /** @type {string} */ (accreditationId)
    )
  const { endDate } = periodBounds(
    cadence,
    /** @type {number} */ (year),
    period
  )

  // The read model only serves an accreditation with a validFrom.
  if (
    endDate.localeCompare(toCalendarDate(/** @type {string} */ (validFrom))) < 0
  ) {
    throw Boom.notFound('Report period is before the accreditation started')
  }
}

/** @type {[NaturalKeyRoute, string, NaturalKeyResponse?][]} */
const submissionRoutes = [
  [reportsGetDetail, '', respondWithReport(mapDetail)],
  [reportsPost, '', respondWithReport(mapCreated)],
  [reportsPatch, '', respondWithReport(mapCommand)],
  [reportsDelete, ''],
  [reportsStatus, '/status', respondWithReport(mapCommand)],
  [reportsUnsubmit, '/unsubmit', respondWithReport(mapCommand)],
  [
    reportsRequestResubmission,
    '/request-resubmission',
    respondWithReport(mapCommand)
  ]
]

export const reportRoutesByNaturalKey = [
  ...streams.flatMap(({ path, params, accredited }) =>
    submissionRoutes.map(([route, action, respond]) =>
      atNaturalKeys(route, `${path}${action}`, params, {
        accredited,
        respond,
        ...(accredited && { before: assertPeriodWithinAccreditation })
      })
    )
  ),
  atNaturalKeys(
    reportsGet,
    `${registrationPath}/reports/calendar`,
    registrationParams
  )
]
