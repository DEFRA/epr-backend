import Joi from 'joi'

import { uploadCallbackUrl } from '#common/helpers/auth/upload-callback-signature.js'
import { yearSchema } from '#common/validation/year-schema.js'
import {
  accreditationPath,
  registrationParams,
  registrationPath
} from '#organisations/index.js'
import { atSummaryLogKeys } from './at-summary-log-keys.js'
import { summaryLogDocument } from './document/get.js'
import { summaryLogFile, summaryLogFileByFileId } from './file/get.js'
import { summaryLogsGet } from './get.js'
import { summaryLogsList } from './list/get.js'
import { uploadCompletedPath } from './natural-key-paths.js'
import { summaryLogRecordsCsv } from './records/get.js'
import { summaryLogsSubmit } from './submit/post.js'
import {
  assertSummaryLogFileMatchesPath,
  assertSummaryLogMatchesPath
} from './summary-log-matches-path.js'
import { summaryLogsUploadCompletedYear } from './upload-completed/year-post.js'
import { summaryLogsYearCreate } from './year-post.js'

/**
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { SummaryLogKeyedRequest } from './at-summary-log-keys.js'
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
 * @returns {(request: SummaryLogKeyedRequest & { params: { year: Year } }) => void}
 */
const callbackToNaturalKeys = (accredited) => (request) => {
  const { organisationNumber, registrationNumber, year } = request.params
  const app =
    /** @type {{ summaryLogCallbackUrl?: (summaryLogId: string) => string }} */ (
      request.app
    )
  app.summaryLogCallbackUrl = (id) =>
    uploadCallbackUrl(
      uploadCompletedPath({
        organisationNumber,
        registrationNumber,
        year,
        accredited,
        summaryLogId: id
      })
    )
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
    } = /** @type {SummaryLogKeyedRequest & { params: { summaryLogId: string } }} */ (
      request
    ).params
    return response.header(
      'Location',
      `/organisations/${organisationNumber}/registrations/${registrationNumber}/summary-logs/${id}`
    )
  }
}

const ownSummaryLog = { before: assertSummaryLogMatchesPath }

/**
 * Summary-log routes addressed by organisation number and registration
 * number (ADR 0053), served beside the id-based routes. An upload is named by
 * its own id, so only creating one, and its callback, carry the year.
 */
export const summaryLogRoutesByNaturalKey = [
  ...uploadAddresses.flatMap(({ address, accredited }) => [
    atSummaryLogKeys(summaryLogsYearCreate, address, yearParams, {
      accredited,
      before: callbackToNaturalKeys(accredited)
    }),
    atSummaryLogKeys(
      summaryLogsUploadCompletedYear,
      `${address}/{summaryLogId}/upload-completed`,
      uploadParams,
      { accredited }
    )
  ]),
  summaryLogsList,
  atSummaryLogKeys(summaryLogsGet, summaryLog, summaryLogParams, ownSummaryLog),
  atSummaryLogKeys(
    submitLocatedAtNaturalKeys,
    `${summaryLog}/submit`,
    summaryLogParams,
    ownSummaryLog
  ),
  atSummaryLogKeys(
    summaryLogFile,
    `${summaryLog}/file`,
    summaryLogParams,
    ownSummaryLog
  ),
  atSummaryLogKeys(
    summaryLogDocument,
    `${summaryLog}/document`,
    summaryLogParams,
    ownSummaryLog
  ),
  atSummaryLogKeys(
    summaryLogFileByFileId,
    `${summaryLogs}/files/{fileId}`,
    fileParams,
    { before: assertSummaryLogFileMatchesPath }
  ),
  summaryLogRecordsCsv
]
