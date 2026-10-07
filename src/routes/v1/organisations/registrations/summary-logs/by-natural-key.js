import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { config } from '#root/config.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  accreditationPath,
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { summaryLogDocument } from './document/get.js'
import { summaryLogFile, summaryLogFileByFileId } from './file/get.js'
import { summaryLogsGet } from './get.js'
import { uploadCompletedPath } from './natural-key-paths.js'
import { summaryLogRecordsCsv } from './records/get.js'
import { summaryLogsSubmit } from './submit/post.js'
import { assertSummaryLogMatchesPath } from './summary-log-matches-path.js'
import { summaryLogsUploadCompletedYear } from './upload-completed/year-post.js'
import { summaryLogsYearCreate } from './year-post.js'

/**
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { NaturalKeyRoute, ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 */

const yearParams = { ...registrationParams, year: yearSchema().required() }
const summaryLogId = Joi.string().required()
const uploadParams = { ...yearParams, summaryLogId }
const summaryLogParams = { ...registrationParams, summaryLogId }
const fileParams = { ...registrationParams, fileId: Joi.string().required() }

const summaryLogs = `${registrationPath}/summary-logs`
const summaryLog = `${summaryLogs}/{summaryLogId}`

/**
 * Where an upload starts: the year, and whether it is accredited, are chosen
 * here and carried to its upload-completed callback.
 */
const uploadAddresses = [
  { address: `${summaryLogs}/{year}`, accredited: false },
  { address: `${accreditationPath}/summary-log`, accredited: true }
]

/**
 * @param {boolean} accredited
 * @returns {(request: ResolvedRequest) => void}
 */
const callbackToNaturalKeys = (accredited) => (request) => {
  const { organisationNumber, registrationNumber, year } = request.params
  const app =
    /** @type {{ summaryLogCallbackUrl?: (summaryLogId: string) => string }} */ (
      request.app
    )
  app.summaryLogCallbackUrl = (id) =>
    `${config.get('appBaseUrl')}${uploadCompletedPath({
      organisationNumber,
      registrationNumber,
      year: /** @type {number} */ (year),
      accredited,
      summaryLogId: id
    })}`
}

/**
 * Submit answers with the summary log's natural-key address.
 *
 * @type {NaturalKeyRoute}
 */
const submitLocatedAtNaturalKeys = {
  ...summaryLogsSubmit,
  handler: async (request, h) => {
    const response = /** @type {ResponseObject} */ (
      await summaryLogsSubmit.handler(
        /** @type {Parameters<typeof summaryLogsSubmit.handler>[0]} */ (
          request
        ),
        h
      )
    )
    const {
      organisationNumber,
      registrationNumber,
      summaryLogId: id
    } = /** @type {ResolvedRequest & { params: { summaryLogId: string } }} */ (
      request
    ).params
    return response.header(
      'Location',
      `/organisations/${organisationNumber}/registrations/${registrationNumber}/summary-logs/${id}`
    )
  }
}

/**
 * Answers without the database ids the stored summary log carries: these
 * routes address the organisation, registration and accreditation by their
 * domain keys.
 *
 * @param {NaturalKeyRoute} route
 * @param {string[]} ids
 * @returns {NaturalKeyRoute}
 */
const withoutDatabaseIds = (route, ids) => ({
  ...route,
  handler: async (request, h) => {
    const response = /** @type {ResponseObject} */ (
      await route.handler(request, h)
    )
    const body = /** @type {Record<string, unknown>} */ (response.source)
    for (const id of ids) {
      delete body[id]
    }
    return response
  }
})

const ownSummaryLog = { before: assertSummaryLogMatchesPath }

/**
 * Summary-log routes addressed by organisation number and registration
 * number (ADR 0053), served beside the id-based routes. An upload is named by
 * its own id, so only creating one, and its callback, carry the year.
 */
export const summaryLogRoutesByNaturalKey = [
  ...uploadAddresses.flatMap(({ address, accredited }) => [
    atNaturalKeys(summaryLogsYearCreate, address, yearParams, {
      accredited,
      before: callbackToNaturalKeys(accredited)
    }),
    atNaturalKeys(
      summaryLogsUploadCompletedYear,
      `${address}/{summaryLogId}/upload-completed`,
      uploadParams,
      { accredited }
    )
  ]),
  atNaturalKeys(
    withoutDatabaseIds(summaryLogsGet, ['accreditationId']),
    summaryLog,
    summaryLogParams,
    ownSummaryLog
  ),
  atNaturalKeys(
    submitLocatedAtNaturalKeys,
    `${summaryLog}/submit`,
    summaryLogParams,
    ownSummaryLog
  ),
  atNaturalKeys(
    summaryLogFile,
    `${summaryLog}/file`,
    summaryLogParams,
    ownSummaryLog
  ),
  atNaturalKeys(
    withoutDatabaseIds(summaryLogDocument, [
      'organisationId',
      'registrationId',
      'accreditationId'
    ]),
    `${summaryLog}/document`,
    summaryLogParams,
    ownSummaryLog
  ),
  atNaturalKeys(
    summaryLogFileByFileId,
    `${summaryLogs}/files/{fileId}`,
    fileParams
  ),
  atNaturalKeys(
    summaryLogRecordsCsv,
    `${summaryLogs}/files/{fileId}/records.csv`,
    fileParams
  )
]
