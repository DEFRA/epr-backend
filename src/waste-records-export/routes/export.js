import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const getWasteRecordsExportPath = '/v1/admin/waste-records/export.csv'

// Drop the trailing `.sssZ` (5 chars) from `new Date().toISOString()` to keep
// just second-precision and then re-add `Z` after swapping `:` for `-`.
const ISO_MILLISECOND_SUFFIX_LENGTH = 5

/**
 * @param {string} [organisationId]
 * @returns {string}
 */
const buildFilename = (organisationId) => {
  // ISO is `YYYY-MM-DDTHH:MM:SS.sssZ`; we want second precision and `:` swapped
  // for `-` so the name is filesystem-safe.
  const stamp = new Date()
    .toISOString()
    .slice(0, -ISO_MILLISECOND_SUFFIX_LENGTH)
    .replaceAll(':', '-')
  // Include the org id when scoped so a file emailed to a single org is
  // self-identifying.
  const scope = organisationId ? `${organisationId}-` : ''
  return `waste-records-${scope}${stamp}Z.csv`
}

export const wasteRecordsExportRoute = {
  method: 'GET',
  path: getWasteRecordsExportPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        organisationId: Joi.string().optional(),
        // A registration only makes sense within an organisation, so require
        // its parent id alongside it.
        registrationId: Joi.string().optional().when('organisationId', {
          is: Joi.exist(),
          otherwise: Joi.forbidden()
        })
      })
    }
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStateRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   overseasSitesRepository: OverseasSitesRepository,
   *   query: { organisationId?: string, registrationId?: string }
   * }} request
   */
  handler: (request, h) => {
    const { organisationId, registrationId } = request.query

    const stream = streamCsvExportToReadable({
      organisationsRepository: request.organisationsRepository,
      summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
      ledgerRepository: request.ledgerRepository,
      summaryLogsRepository: request.summaryLogsRepository,
      overseasSitesRepository: request.overseasSitesRepository,
      organisationId,
      registrationId
    })

    return h
      .response(stream)
      .type('text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${buildFilename(organisationId)}"`
      )
  }
}
