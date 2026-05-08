import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { streamCsvExportToReadable } from '../application/stream-csv-export.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { WasteRecordsRepository } from '#repositories/waste-records/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

export const getWasteRecordsExportPath = '/v1/admin/waste-records/export.csv'

const buildFilename = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z')
  return `waste-records-${stamp}.csv`
}

export const wasteRecordsExportRoute = {
  method: 'GET',
  path: getWasteRecordsExportPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
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
