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
import { summaryLogPath } from './natural-key-paths.js'
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
const summaryLogParams = {
  ...yearParams,
  summaryLogId: Joi.string().required()
}
const fileParams = { ...registrationParams, fileId: Joi.string().required() }

const kinds = [
  { summaryLogs: `${registrationPath}/summary-logs/{year}`, accredited: false },
  { summaryLogs: `${accreditationPath}/summary-log`, accredited: true }
]

/**
 * @param {ResolvedRequest} request
 * @param {boolean} accredited
 * @param {string} summaryLogId
 * @param {string} [suffix]
 */
const pathOf = (request, accredited, summaryLogId, suffix) =>
  summaryLogPath({
    organisationNumber: request.params.organisationNumber,
    registrationNumber: request.params.registrationNumber,
    year: /** @type {number} */ (request.params.year),
    accredited,
    summaryLogId,
    suffix
  })

/**
 * @param {boolean} accredited
 * @returns {(request: ResolvedRequest) => void}
 */
const callbackToNaturalKeys = (accredited) => (request) => {
  const app =
    /** @type {{ summaryLogCallbackUrl?: (summaryLogId: string) => string }} */ (
      request.app
    )
  app.summaryLogCallbackUrl = (summaryLogId) =>
    `${config.get('appBaseUrl')}${pathOf(request, accredited, summaryLogId, '/upload-completed')}`
}

/**
 * Submit answers with the summary log's address; on these routes, that is
 * the address it was posted to.
 *
 * @param {boolean} accredited
 * @returns {NaturalKeyRoute}
 */
const submitLocatedAtNaturalKeys = (accredited) => ({
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
    const resolved =
      /** @type {ResolvedRequest & { params: { summaryLogId: string } }} */ (
        request
      )
    return response.header(
      'Location',
      pathOf(resolved, accredited, resolved.params.summaryLogId)
    )
  }
})

/**
 * Summary-log routes addressed by organisation number, registration number
 * and year (ADR 0053), served beside the id-based routes.
 */
export const summaryLogRoutesByNaturalKey = [
  ...kinds.flatMap(({ summaryLogs, accredited }) => {
    const summaryLog = `${summaryLogs}/{summaryLogId}`
    const ownSummaryLog = { accredited, before: assertSummaryLogMatchesPath }
    return [
      atNaturalKeys(summaryLogsYearCreate, summaryLogs, yearParams, {
        accredited,
        before: callbackToNaturalKeys(accredited)
      }),
      atNaturalKeys(
        summaryLogsUploadCompletedYear,
        `${summaryLog}/upload-completed`,
        summaryLogParams,
        { accredited }
      ),
      atNaturalKeys(
        summaryLogsGet,
        summaryLog,
        summaryLogParams,
        ownSummaryLog
      ),
      atNaturalKeys(
        submitLocatedAtNaturalKeys(accredited),
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
        summaryLogDocument,
        `${summaryLog}/document`,
        summaryLogParams,
        ownSummaryLog
      )
    ]
  }),
  atNaturalKeys(
    summaryLogFileByFileId,
    `${registrationPath}/summary-logs/files/{fileId}`,
    fileParams
  ),
  atNaturalKeys(
    summaryLogRecordsCsv,
    `${registrationPath}/summary-logs/files/{fileId}/records.csv`,
    fileParams
  )
]
