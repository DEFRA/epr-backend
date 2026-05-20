import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { WasteRecordsRepository } from '#repositories/waste-records/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const getWasteRecordsExportPath = '/v1/admin/waste-records/export.csv'

// Drop the trailing `.sssZ` (5 chars) from `new Date().toISOString()` to keep
// just second-precision and then re-add `Z` after swapping `:` for `-`.
const ISO_MILLISECOND_SUFFIX_LENGTH = 5

const buildFilename = () => {
  // ISO is `YYYY-MM-DDTHH:MM:SS.sssZ`; we want second precision and `:` swapped
  // for `-` so the name is filesystem-safe.
  const stamp = new Date()
    .toISOString()
    .slice(0, -ISO_MILLISECOND_SUFFIX_LENGTH)
    .replaceAll(':', '-')
  return `waste-records-${stamp}Z.csv`
}

export const wasteRecordsExportRoute = {
  method: 'GET',
  path: getWasteRecordsExportPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin']
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   wasteRecordsRepository: WasteRecordsRepository,
   *   summaryLogsRepository: SummaryLogsRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   */
  handler: (request, h) => {
    const stream = streamCsvExportToReadable({
      organisationsRepository: request.organisationsRepository,
      wasteRecordsRepository: request.wasteRecordsRepository,
      summaryLogsRepository: request.summaryLogsRepository,
      overseasSitesRepository: request.overseasSitesRepository
    })

    return h
      .response(stream)
      .type('text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${buildFilename()}"`
      )
  }
}
