import { SCOPES } from '#common/helpers/auth/constants.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
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
   *   params: Record<string, string>,
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   overseasSitesRepository: OverseasSitesRepository,
   *   app: { organisation: Organisation, registration: Registration }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationId, registrationId } = request.params
    const { organisation, registration } = request.app

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
          organisationId,
          registrationId
        })
      )
      .type('text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        buildDownloadDisposition(
          /** @type {string} */ (registration.registrationNumber),
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
