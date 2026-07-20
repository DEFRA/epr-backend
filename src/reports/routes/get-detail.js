import { StatusCodes } from 'http-status-codes'

import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
import { canRequestResubmission } from '#reports/application/resubmission-service.js'
import { periodParamsSchema, withRegistrationDetails } from './shared.js'
import { reportDetailResponseSchema } from './response.schema.js'
import { reportResponseFailAction } from './response-fail-action.js'
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

/**
 * @param {ReportsRepository} reportsRepository
 * @param {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail | import('#reports/repository/port.js').Report} report
 * @param {string} organisationId
 * @param {string} registrationId
 */
async function resolveCanRequestResubmission(
  reportsRepository,
  report,
  organisationId,
  registrationId
) {
  if ('diagnostics' in report) {
    return false
  }

  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  return canRequestResubmission(periodicReports, {
    status: report.status.currentStatus,
    resubmissionRequired: report.resubmissionRequired,
    year: report.year,
    cadence: /** @type {import('#reports/domain/cadence.js').Cadence} */ (
      report.cadence
    ),
    period: report.period,
    submissionNumber: report.submissionNumber
  })
}

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
      failAction: reportResponseFailAction
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

    warnIfWasteRecordsExcluded(request, report, organisationId, registrationId)

    const canRequestResubmissionFlag = await resolveCanRequestResubmission(
      reportsRepository,
      report,
      organisationId,
      registrationId
    )

    return h
      .response({
        ...withRegistrationDetails(report, registration),
        canRequestResubmission: canRequestResubmissionFlag
      })
      .code(StatusCodes.OK)
  }
}
