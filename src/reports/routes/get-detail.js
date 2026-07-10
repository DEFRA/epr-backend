import { StatusCodes } from 'http-status-codes'

import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
import { periodParamsSchema, withRegistrationDetails } from './shared.js'
import { reportDetailResponseSchema } from './response.schema.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js'
 * @import { PeriodWithSubmissionPathParams } from './shared.js'
 */

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}'

export const reportsGetDetail = {
  method: 'GET',
  path: reportsGetDetailPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationRead, SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      params: periodParamsSchema
    },
    response: {
      schema: reportDetailResponseSchema,
      failAction: 'error'
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: PeriodWithSubmissionPathParams,
   *   organisationsRepository: OrganisationsRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStateRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   reportsRepository: ReportsRepository,
   *   overseasSitesRepository: OverseasSitesRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      organisationsRepository,
      ledgerRepository,
      summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      reportsRepository,
      overseasSitesRepository,
      params
    } = request
    const {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber
    } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const report = await fetchOrGenerateReportForPeriod({
      reportsRepository,
      ledgerRepository,
      summaryLogRowStateRepository: summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      overseasSitesRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period,
      submissionNumber
    })

    // The 'diagnostics' in report check acts as a type discriminator:
    // fetchOrGenerateReportForPeriod returns Report | AggregatedReportDetail,
    // and only AggregatedReportDetail carries diagnostics (and operatorCategory).
    if (
      'diagnostics' in report &&
      report.diagnostics.wasteReceivedRecordsExcluded > 0
    ) {
      const { wasteReceivedRecordsExcluded } = report.diagnostics
      request.logger.warn({
        message:
          'Waste records excluded from report due to mismatched date field — possible registered-only to accredited transition (ADR 0030)',
        event: {
          action: 'fetch_or_generate_report',
          reason: `organisationId=${organisationId} registrationId=${registrationId} operatorCategory=${report.operatorCategory} wasteReceivedRecordsExcluded=${wasteReceivedRecordsExcluded}`
        }
      })
    }

    return h
      .response(withRegistrationDetails(report, registration))
      .code(StatusCodes.OK)
  }
}
