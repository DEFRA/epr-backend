import { SCOPES } from '#common/helpers/auth/constants.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  registrationParams,
  registrationPath
} from '#routes/organisations/natural-keys.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */

const CSV_EXTENSION = 'csv'

/**
 * A registration's waste records as they stand now — the latest submission of
 * every ledger partition, the same output the admin export produces when
 * scoped to one registration, but reachable by a regulator. A registration
 * that has never submitted exports the header row alone, so there is no 404.
 */
const registrationWasteRecordsExport = {
  method: 'GET',
  options: {
    auth: {
      scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
    },
    tags: ['api']
  },
  /**
   * @param {HapiRequest & {
   *   params: RegistrationParams,
   *   organisationReadRepository: OrganisationReadRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationNumber, registrationNumber } = request.params

    // No single submission stands behind this export, so it is stamped with
    // the moment it was taken.
    return h
      .response(
        streamCsvExportToReadable({
          organisationReadRepository: request.organisationReadRepository,
          summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
          ledgerRepository: request.ledgerRepository,
          summaryLogsRepository: request.summaryLogsRepository,
          organisationNumber,
          registrationNumber
        })
      )
      .type('text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        buildDownloadDisposition(
          registrationNumber,
          new Date().toISOString(),
          CSV_EXTENSION
        )
      )
  }
}

export const registrationWasteRecordsExportByNumber = atNaturalKeys(
  registrationWasteRecordsExport,
  `${registrationPath}/waste-records/export.csv`,
  registrationParams
)
