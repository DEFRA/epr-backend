import { StatusCodes } from 'http-status-codes'

import Boom from '@hapi/boom'
import { auditReportDelete } from '#reports/application/audit.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  periodParamsSchema,
  standardUserAuth,
  extractChangedBy
} from './shared.js'

export const reportsDeletePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsDelete = {
  method: 'DELETE',
  path: reportsDeletePath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
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

    if (report.status.currentStatus === REPORT_STATUS.SUBMITTED) {
      throw Boom.conflict(
        `Cannot delete a submitted report for ${cadence} period ${period} of ${year}`
      )
    }

    const previous = await reportsRepository.findReportById(report.id)

    await reportsRepository.deleteReport({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber: report.submissionNumber,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    await auditReportDelete(request, {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber: previous.submissionNumber,
      reportId: report.id,
      previous
    })

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */
