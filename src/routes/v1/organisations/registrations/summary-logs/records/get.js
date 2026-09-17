import Boom from '@hapi/boom'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { metaText } from '#domain/summary-logs/stored-meta.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'
import { streamSubmissionCsvToReadable } from '#waste-records-export/application/stream-submission-csv.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository, SummaryLogWithId } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

export const summaryLogRecordsCsvPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/files/{fileId}/records.csv'

const CSV_EXTENSION = 'csv'

/**
 * The submission carrying `fileId`, or undefined when this registration never
 * submitted it. `findAllByOrgReg` also returns the failed uploads, which hold a
 * file but committed no rows.
 *
 * @param {SummaryLogWithId[]} summaryLogs
 * @param {string} fileId
 * @returns {SummaryLog | undefined}
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
  path: summaryLogRecordsCsvPath,
  options: {
    auth: {
      scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
    },
    tags: ['api']
  },
  /**
   * @param {HapiRequest & {
   *   params: Record<string, string>,
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   systemLogsRepository: SystemLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository
   * }} request
   * @param {*} h
   */
  handler: async (request, h) => {
    const { organisationId, registrationId, fileId } = request.params

    // Every read happens here: once the handler has returned a Readable the
    // status is already sent.
    const summaryLog = submittedSummaryLogForFile(
      await request.summaryLogsRepository.findAllByOrgReg(
        organisationId,
        registrationId
      ),
      fileId
    )
    if (!summaryLog?.submittedAt) {
      throw Boom.notFound('Summary log file not found')
    }

    const [org, registration, rowStates] = await Promise.all([
      request.organisationsRepository.findById(organisationId),
      request.organisationsRepository.findRegistrationById(
        organisationId,
        registrationId
      ),
      request.summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        organisationId,
        registrationId,
        fileId
      )
    ])

    await auditSummaryLogDownload(request, {
      summaryLogId: fileId,
      organisationId,
      registrationId
    })

    const response = h
      .response(
        streamSubmissionCsvToReadable({
          org,
          registration,
          meta: summaryLog.meta,
          submittedAt: summaryLog.submittedAt,
          rowStates
        })
      )
      .type('text/csv; charset=utf-8')

    const registrationNumber = metaText(summaryLog.meta?.REGISTRATION_NUMBER)

    return registrationNumber
      ? response.header(
          'Content-Disposition',
          buildDownloadDisposition(
            registrationNumber,
            summaryLog.submittedAt,
            CSV_EXTENSION
          )
        )
      : response
  }
}
