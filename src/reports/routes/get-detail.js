import { StatusCodes } from 'http-status-codes'

import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
import { periodParamsSchema, withRegistrationDetails } from './shared.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { ROLES } from '#common/helpers/auth/constants.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteRecordsRepository } from '#repositories/waste-records/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js'
 * @import { PeriodPathParams } from './shared.js'
 */

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsGetDetail = {
  method: 'GET',
  path: reportsGetDetailPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser, ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      params: periodParamsSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: PeriodPathParams,
   *   organisationsRepository: OrganisationsRepository,
   *   wasteRecordsRepository: WasteRecordsRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   reportsRepository: ReportsRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      organisationsRepository,
      wasteRecordsRepository,
      packagingRecyclingNotesRepository,
      reportsRepository,
      overseasSitesRepository,
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const report = await fetchOrGenerateReportForPeriod({
      reportsRepository,
      wasteRecordsRepository,
      packagingRecyclingNotesRepository,
      overseasSitesRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period
    })

    // The 'diagnostics' in report check acts as a type discriminator:
    // fetchOrGenerateReportForPeriod returns Report | AggregatedReportDetail,
    // and only AggregatedReportDetail carries diagnostics (and operatorCategory).
    if (
      'diagnostics' in report &&
      report.diagnostics.wasteReceivedRecordsExcluded > 0
    ) {
      const { wasteReceivedRecordsExcluded } = report.diagnostics
      request.logger.warn(
        {
          organisationId,
          registrationId,
          operatorCategory: report.operatorCategory,
          wasteReceivedRecordsExcluded
        },
        'Waste records excluded from report due to mismatched date field — possible registered-only to accredited transition (ADR 0030)'
      )
    }

    return h
      .response(withRegistrationDetails(report, registration))
      .code(StatusCodes.OK)
  }
}
