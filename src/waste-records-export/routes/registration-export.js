import { SCOPES } from '#common/helpers/auth/constants.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  registrationParams,
  registrationPath
} from '#routes/organisations/natural-keys.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

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
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   overseasSitesRepository: OverseasSitesRepository,
   *   app: { storedOrganisation: Organisation }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { storedOrganisation: organisation } = request.app
    const { registrationNumber } = request.params

    // No single submission stands behind this export, so it is stamped with
    // the moment it was taken.
    return h
      .response(
        streamCsvExportToReadable({
          organisationsRepository: request.organisationsRepository,
          summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
          ledgerRepository: request.ledgerRepository,
          summaryLogsRepository: request.summaryLogsRepository,
          overseasSitesRepository: request.overseasSitesRepository,
          organisation,
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
