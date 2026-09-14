import Boom from '@hapi/boom'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'
import { streamCsvExportToReadable } from '#waste-records-export/application/stream-csv-export.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository, SummaryLogWithId } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const summaryLogRecordsCsvPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/files/{fileId}/records.csv'

const CSV_EXTENSION = 'csv'

/**
 * The moment the submission carrying `fileId` completed, or undefined when
 * this registration never submitted it. `findAllByOrgReg` also returns the
 * failed uploads, which hold a file but committed no rows.
 *
 * @param {SummaryLogWithId[]} summaryLogs
 * @param {string} fileId
 * @returns {string | undefined}
 */
const submittedAtForFile = (summaryLogs, fileId) =>
  summaryLogs.find(
    ({ summaryLog }) =>
      summaryLog.file.id === fileId &&
      summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED
  )?.summaryLog.submittedAt

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
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   * @param {*} h
   */
  handler: async (request, h) => {
    const { organisationId, registrationId, fileId } = request.params

    // Decides the 404 as well as the name — once the handler has returned a
    // Readable the status is already sent.
    const submittedAt = submittedAtForFile(
      await request.summaryLogsRepository.findAllByOrgReg(
        organisationId,
        registrationId
      ),
      fileId
    )
    if (!submittedAt) {
      throw Boom.notFound('Summary log file not found')
    }

    // Names the download only, so a failed lookup costs the name, not the file.
    const registrationNumber = await request.organisationsRepository
      .findRegistrationById(organisationId, registrationId)
      .then((registration) => registration.registrationNumber)
      .catch(() => undefined)

    await auditSummaryLogDownload(request, {
      summaryLogId: fileId,
      organisationId,
      registrationId
    })

    const response = h
      .response(
        streamCsvExportToReadable({
          organisationsRepository: request.organisationsRepository,
          summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
          ledgerRepository: request.ledgerRepository,
          summaryLogsRepository: request.summaryLogsRepository,
          overseasSitesRepository: request.overseasSitesRepository,
          organisationId,
          registrationId,
          summaryLogFileId: fileId
        })
      )
      .type('text/csv; charset=utf-8')

    return registrationNumber
      ? response.header(
          'Content-Disposition',
          buildDownloadDisposition(
            registrationNumber,
            submittedAt,
            CSV_EXTENSION
          )
        )
      : response
  }
}
