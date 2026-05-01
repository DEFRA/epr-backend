import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { auditReportStatusTransition } from '#reports/application/audit.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { periodParamsSchema, extractChangedBy } from './shared.js'

export const reportsUnsubmitPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}/unsubmit'

export const reportsUnsubmit = {
  method: 'POST',
  path: reportsUnsubmitPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    validate: {
      params: periodParamsSchema
    }
  },
  /**
   * @param {HapiRequest & { reportsRepository: ReportsRepository, systemLogsRepository: SystemLogsRepository }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { reportsRepository, params } = request
    const { organisationId, registrationId, cadence } = params
    const year = Number(params.year)
    const period = Number(params.period)

    const report = await fetchCurrentReport(
      reportsRepository,
      organisationId,
      registrationId,
      year,
      cadence,
      period
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

    const updated = await reportsRepository.unsubmitReport({
      reportId: report.id,
      version: report.version,
      changedBy: extractChangedBy(request.auth.credentials)
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
 */
