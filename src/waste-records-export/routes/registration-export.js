import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const registrationWasteRecordsExportPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/waste-records/export.csv'

const CSV_EXTENSION = 'csv'

/**
 * A registration's waste records as they stand now — the latest submission of
 * every ledger partition, the same output the admin export produces when
 * scoped to one registration, but reachable by a regulator. A registration
 * that has never submitted exports the header row alone, so there is no 404.
 */
export const registrationWasteRecordsExport = {
  method: 'GET',
  path: registrationWasteRecordsExportPath,
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
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationId, registrationId } = request.params

    // Names the download only, so a failed lookup costs the name, not the file.
    const registrationNumber = await request.organisationsRepository
      .findRegistrationById(organisationId, registrationId)
      .then((registration) => registration.registrationNumber)
      .catch(() => undefined)

    const response = h
      .response(
        streamCsvExportToReadable({
          organisationsRepository: request.organisationsRepository,
          summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
          ledgerRepository: request.ledgerRepository,
          summaryLogsRepository: request.summaryLogsRepository,
          overseasSitesRepository: request.overseasSitesRepository,
          organisationId,
          registrationId
        })
      )
      .type('text/csv; charset=utf-8')

    // No single submission stands behind this export, so it is stamped with
    // the moment it was taken.
    return registrationNumber
      ? response.header(
          'Content-Disposition',
          buildDownloadDisposition(
            registrationNumber,
            new Date().toISOString(),
            CSV_EXTENSION
          )
        )
      : response
  }
}
