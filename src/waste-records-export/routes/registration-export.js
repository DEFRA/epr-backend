import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  findOrganisationAndRegistrationReadModels,
  registrationParams,
  registrationPath
} from '#routes/organisations/natural-keys.js'
import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { RegistrationParams } from '#routes/organisations/natural-keys.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */

const CSV_EXTENSION = 'csv'

/**
 * A registration's waste records as they stand now — the latest submission of
 * every ledger partition, the same output the admin export produces when
 * scoped to one registration, but reachable by a regulator. A registration
 * that has never submitted exports the header row alone.
 */
export const registrationWasteRecordsExportByNumber = {
  method: 'GET',
  path: `${registrationPath}/waste-records/export.csv`,
  options: {
    auth: {
      scope: [`+${SCOPES.summaryLogRead}`, `+${SCOPES.organisationRead}`]
    },
    tags: ['api'],
    validate: { params: Joi.object(registrationParams) }
  },
  /**
   * @param {HapiRequest & {
   *   params: RegistrationParams,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation } =
      await findOrganisationAndRegistrationReadModels(request)
    const { registrationNumber } = request.params

    // No single submission stands behind this export, so it is stamped with
    // the moment it was taken.
    return h
      .response(
        streamCsvExportToReadable({
          organisationReadRepository: request.organisationReadRepository,
          summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
          ledgerRepository: request.ledgerRepository,
          summaryLogsRepository: request.summaryLogsRepository,
          organisation,
          registrationNumber,
          showYear: request.config.get('featureFlags.wasteRecordsExportYear')
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
