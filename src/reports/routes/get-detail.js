import { StatusCodes } from 'http-status-codes'

import { requiredReportingPeriods } from '#reports/application/report-calendar.js'
import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
import { cadenceAccreditationFor } from '#reports/domain/cadence.js'
import { withRegistrationDetails } from './shared.js'
import { reportDetailResponseSchema } from './response.schema.js'
import { reportResponseFailAction } from './response-fail-action.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { RegistrationParams } from '#routes/organisations/natural-keys.js'
 * @import { ReportRequest } from './shared.js'
 */

/**
 * @param {HapiRequest} request
 * @param {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail | import('#reports/repository/port.js').Report} report
 * @param {RegistrationParams} numbers
 */
function warnIfWasteRecordsExcluded(
  request,
  report,
  { organisationNumber, registrationNumber }
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
      reason: `organisationNumber=${organisationNumber} registrationNumber=${registrationNumber} operatorCategory=${report.operatorCategory} wasteReceivedRecordsExcluded=${wasteReceivedRecordsExcluded}`
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
   * @param {ReportRequest & {
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   reportsRepository: ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      ledgerRepository,
      summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      reportsRepository,
      params
    } = request
    const { year, cadence, period, submissionNumber } = params
    const { registration, accreditation } = request.app

    const report = await fetchOrGenerateReportForPeriod({
      reportsRepository,
      ledgerRepository,
      summaryLogRowStatesRepository,
      packagingRecyclingNotesRepository,
      key: params,
      reportRegistration: { registration, accreditation },
      year,
      cadenceAccreditation: cadenceAccreditationFor(
        cadence,
        registration.accreditations[year]?.accreditationNumber
      ),
      period,
      submissionNumber,
      requiredPeriods: requiredReportingPeriods({
        registration,
        year,
        cadence
      }),
      reportDataValidationEnabled: request.config.get(
        'featureFlags.reportDataValidation'
      )
    })

    warnIfWasteRecordsExcluded(request, report, params)

    return h
      .response({
        ...withRegistrationDetails(report, registration),
        canRequestResubmission: report.canRequestResubmission
      })
      .code(StatusCodes.OK)
  }
}
