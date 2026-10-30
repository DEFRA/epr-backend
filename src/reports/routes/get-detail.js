import { StatusCodes } from 'http-status-codes'

import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
import {
  findRegistrationForReport,
  requiredPeriodsFor,
  withRegistrationDetails
} from './shared.js'
import { reportDetailResponseSchema } from './response.schema.js'
import { reportResponseFailAction } from './response-fail-action.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js'
 * @import { PeriodWithSubmissionPathParams } from './shared.js'
 * @import { ResolvedRecords } from '#routes/organisations/at-natural-keys.js'
 */

/**
 * @param {HapiRequest} request
 * @param {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail | import('#reports/repository/port.js').Report} report
 * @param {string} organisationId
 * @param {string} registrationId
 */
function warnIfWasteRecordsExcluded(
  request,
  report,
  organisationId,
  registrationId
) {
  // The 'diagnostics' in report check acts as a type discriminator:
  // fetchOrGenerateReportForPeriod returns Report | AggregatedReportDetail,
  // and only AggregatedReportDetail carries diagnostics (and operatorCategory).
  if (
    !('diagnostics' in report) ||
    report.diagnostics.wasteReceivedRecordsExcluded === 0
  ) {
    return
  }

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

export const reportsGetDetail = {
  method: 'GET',
  options: {
    auth: getAuthConfig([SCOPES.organisationRead, SCOPES.adminRead]),
    tags: ['api'],
    response: {
      schema: reportDetailResponseSchema,
      failAction: reportResponseFailAction
    }
  },
  /**
   * @param {Omit<HapiRequest, 'app'> & {
   *   app: ResolvedRecords,
   *   params: PeriodWithSubmissionPathParams,
   *   organisationsRepository: OrganisationsRepository,
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
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
      params,
      app
    } = request
    const {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber
    } = params

    const registration = await findRegistrationForReport(
      organisationsRepository,
      params
    )

    const report = await fetchOrGenerateReportForPeriod({
      reportsRepository,
      ledgerRepository,
      summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      overseasSitesRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period,
      submissionNumber,
      requiredPeriods: requiredPeriodsFor(app, params),
      reportDataValidationEnabled: request.config.get(
        'featureFlags.reportDataValidation'
      )
    })

    warnIfWasteRecordsExcluded(request, report, organisationId, registrationId)

    return h
      .response({
        ...withRegistrationDetails(report, registration),
        canRequestResubmission: report.canRequestResubmission
      })
      .code(StatusCodes.OK)
  }
}
