import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { auditReportStatusTransition } from '#reports/application/audit.js'
import { fetchReportBySubmissionNumber } from '#reports/application/report-service.js'
import { isLatestSubmission } from '#reports/application/resubmission-service.js'
import { isResubmissionRequired } from '#reports/domain/resubmission.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { periodParamsSchema, extractChangedBy } from './shared.js'

export const reportsUnsubmitPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}/unsubmit'

export const reportsUnsubmit = {
  method: 'POST',
  path: reportsUnsubmitPath,
  options: {
    auth: {
      scope: [SCOPES.adminWrite]
    },
    tags: ['api', 'admin'],
    validate: {
      params: periodParamsSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: PeriodWithSubmissionPathParams,
   *   reportsRepository: ReportsRepository,
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { reportsRepository, params } = request
    const { organisationId, registrationId, cadence } = params
    const year = Number(params.year)
    const period = Number(params.period)
    const submissionNumber = Number(params.submissionNumber)

    const report = await fetchReportBySubmissionNumber(
      reportsRepository,
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber
    )

    if (!report) {
      throw Boom.notFound(
        `No report found for ${cadence} period ${period} of ${year}`
      )
    }

    if (report.status.currentStatus !== REPORT_STATUS.SUBMITTED) {
      throw Boom.conflict(
        `Cannot unsubmit a report with status '${report.status.currentStatus}'`
      )
    }

    // An operator has already been asked to resubmit this report. Unsubmitting
    // it now would silently clear that outstanding requirement.
    if (isResubmissionRequired(report.resubmissionRequired)) {
      throw Boom.conflict(
        `Cannot unsubmit submission ${submissionNumber}: it is marked as requiring resubmission`
      )
    }

    // Only the latest submission may be unsubmitted. Unsubmitting one that a
    // later submission has superseded — whether that later submission is itself
    // submitted or still an in-progress resubmission draft — would silently drop
    // it from the admin submission history (PAE-1657).
    const isLatest = await isLatestSubmission(
      reportsRepository,
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber
    )
    if (!isLatest) {
      throw Boom.conflict(
        `Cannot unsubmit submission ${submissionNumber}: it has been superseded by a later submission`
      )
    }

    const updated = await reportsRepository.updateReportStatus({
      reportId: report.id,
      version: report.version,
      status: REPORT_STATUS.READY_TO_SUBMIT,
      slot: REPORT_STATUS_SLOT.UNSUBMITTED,
      changedBy: {
        ...extractChangedBy(request.auth.credentials),
        position: 'Service Maintainer'
      }
    })

    await auditReportStatusTransition(request, {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber: report.submissionNumber,
      reportId: report.id,
      previous: report,
      next: updated
    })

    return h
      .response({ status: updated.status.currentStatus })
      .code(StatusCodes.OK)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 * @import { PeriodWithSubmissionPathParams } from './shared.js'
 */
