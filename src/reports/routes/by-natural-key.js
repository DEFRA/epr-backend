import Boom from '@hapi/boom'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { accreditedFrom } from '#reports/application/report-calendar.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { periodSchema } from '#reports/repository/schema.js'
import {
  accreditationPath,
  registrationParams,
  registrationPath
} from '#routes/organisations/natural-keys.js'
import { atReportKeys } from './at-report-keys.js'
import { reportsDelete } from './delete.js'
import { reportsYearCalendar } from './get-year-calendar.js'
import { reportsGetDetail } from './get-detail.js'
import { reportsPatch } from './patch.js'
import { reportsPost } from './post.js'
import { reportsRequestResubmission } from './request-resubmission.js'
import { reportsStatus } from './status.js'
import { reportsUnsubmit } from './unsubmit.js'
import {
  REPORT_EXPANSION,
  expandableReportResourceSchema,
  reportResourceSchema,
  toReportDetail,
  toReportResource
} from './report-resource.js'
import { reportResponseFailAction } from './response-fail-action.js'
import { submissionNumberSchema } from './shared.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { ReportResponse } from './at-report-keys.js'
 * @import { PreviewBody, StoredReportBody } from './report-resource.js'
 * @import { ReportRequest } from './shared.js'
 *
 * @typedef {ReportRequest} SubmissionRequest
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
 * @param {ReportResponse['map']} map
 * @param {ReportResponse['schema']} [schema]
 * @returns {ReportResponse}
 */
const respondWithReport = (map, schema = reportResourceSchema) => ({
  schema,
  failAction: reportResponseFailAction,
  map
})

/**
 * @param {SubmissionRequest} request
 * @param {ReportDetailBody} body
 */
const toResource = (request, body) =>
  toReportResource(body, { submissionNumber: request.params.submissionNumber })

/**
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 * @param {ReportDetailBody} body
 * @param {number} statusCode
 */
const serveReport = (request, h, body, statusCode) =>
  h.response(toResource(request, body)).code(statusCode)

/**
 * Serves the report read, expanded with `detail` when asked.
 * @param {SubmissionRequest} request
 * @param {HapiResponseToolkit} h
 * @param {ResponseObject} response
 */
const mapRead = (request, h, response) => {
  const body = /** @type {ReportDetailBody} */ (response.source)
  return h
    .response({
      ...toResource(request, body),
      ...(request.query.expand === REPORT_EXPANSION.detail && {
        detail: toReportDetail(body)
      })
    })
    .code(response.statusCode)
}

/**
 * The report detail read, which can be asked to expand the resource with the
 * report as the service holds it.
 * @type {NaturalKeyRoute}
 */
const expandableReportsGetDetail = {
  ...reportsGetDetail,
  handler: (request, h) => {
    if (
      request.query.expand === REPORT_EXPANSION.detail &&
      // The route's auth admits only credentials with a scope.
      !(
        /** @type {string[]} */ (request.auth.credentials.scope).includes(
          SCOPES.adminRead
        )
      )
    ) {
      throw Boom.forbidden('Expanding a report needs admin.read')
    }
    return reportsGetDetail.handler(
      /** @type {Parameters<typeof reportsGetDetail.handler>[0]} */ (
        /** @type {unknown} */ (request)
      ),
      /** @type {HapiResponseToolkit} */ (h)
    )
  },
  options: {
    ...reportsGetDetail.options,
    validate: {
      ...reportsGetDetail.options.validate,
      query: Joi.object({
        expand: Joi.string().valid(...Object.values(REPORT_EXPANSION))
      })
    }
  }
}

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
 * @param {ReportRequest} request
 */
const assertPeriodWithinAccreditation = (request) => {
  const { year, cadence, period } = request.params
  const from = accreditedFrom(request.app.registration, year)
  const { endDate } = periodBounds(cadence, year, period)

  if (from === undefined || endDate.localeCompare(from) < 0) {
    throw Boom.notFound('Report period is before the accreditation started')
  }
}

/** @type {[NaturalKeyRoute, string, ReportResponse?][]} */
const submissionRoutes = [
  [
    expandableReportsGetDetail,
    '',
    respondWithReport(mapRead, expandableReportResourceSchema)
  ],
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
      atReportKeys(route, `${path}${action}`, params, {
        accredited,
        respond,
        ...(accredited && { before: assertPeriodWithinAccreditation })
      })
    )
  ),
  atReportKeys(
    reportsYearCalendar,
    `${registrationPath}/reports/{year}/calendar`,
    { ...registrationParams, year: yearSchema().required() }
  )
]
