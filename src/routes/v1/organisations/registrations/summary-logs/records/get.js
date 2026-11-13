/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
import Boom from '@hapi/boom'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { metaText } from '#domain/summary-logs/stored-meta.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import {
  findOrganisationAndRegistrationReadModels,
  registrationParams,
  registrationPath
} from '#routes/organisations/natural-keys.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'
import { streamSubmissionCsvToReadable } from '#waste-records-export/application/stream-submission-csv.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { KeyedSummaryLog, KeyedSummaryLogWithId, SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

const CSV_EXTENSION = 'csv'

/**
 * The submission carrying `fileId`, or undefined when this registration never
 * submitted it. `findAll` also returns the failed uploads, which hold a file
 * but committed no rows.
 *
 * @param {KeyedSummaryLogWithId[]} summaryLogs
 * @param {SummaryLogFileId} fileId
 * @returns {KeyedSummaryLog | undefined}
 */
const submittedSummaryLogForFile = (summaryLogs, fileId) =>
  summaryLogs.find(
    ({ summaryLog }) =>
      summaryLog.file.id === fileId &&
      summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED
  )?.summaryLog

/**
 * The service's own record of one submission, in the admin export's format.
 * Answers the same callers as the XLSX download beside it, but streams rather
 * than redirecting: the workbook lives in S3, this CSV is generated.
 */
export const summaryLogRecordsCsv = {
  method: 'GET',
  path: `${registrationPath}/summary-logs/files/{fileId}/records.csv`,
  options: {
    auth: {
      scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        ...registrationParams,
        fileId: Joi.string().required()
      })
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: RegistrationParams & { fileId: SummaryLogFileId },
   *   summaryLogsRepository: SummaryLogsRepository,
   *   systemLogsRepository: SystemLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
   * }} request
   * @param {*} h
   */
  handler: async (request, h) => {
    const { organisationNumber, registrationNumber, fileId } = request.params

    // Every read happens here: once the handler has returned a Readable the
    // status is already sent.
    const summaryLog = submittedSummaryLogForFile(
      await request.summaryLogsRepository.findAll({
        organisationNumber,
        registrationNumber
      }),
      fileId
    )
    if (!summaryLog?.submittedAt) {
      throw Boom.notFound('Summary log file not found')
    }

    const [{ organisation, registration }, rowStates] = await Promise.all([
      findOrganisationAndRegistrationReadModels(request),
      request.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        organisationNumber,
        registrationNumber,
        fileId
      )
    ])

    await auditSummaryLogDownload(request, {
      summaryLogId: fileId,
      organisationNumber,
      registrationNumber,
      accreditationNumber: summaryLog.accreditationNumber
    })

    const response = h
      .response(
        streamSubmissionCsvToReadable({
          org: organisation,
          registration,
          meta: summaryLog.meta,
          submittedAt: summaryLog.submittedAt,
          rowStates
        })
      )
      .type('text/csv; charset=utf-8')

    const declaredRegistrationNumber = metaText(
      summaryLog.meta?.REGISTRATION_NUMBER
    )

    return declaredRegistrationNumber
      ? response.header(
          'Content-Disposition',
          buildDownloadDisposition(
            declaredRegistrationNumber,
            summaryLog.submittedAt,
            CSV_EXTENSION
          )
        )
      : response
  }
}
