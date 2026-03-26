import { StatusCodes } from 'http-status-codes'

import Boom from '@hapi/boom'
import { auditReportStatusTransition } from '#reports/application/audit.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { isValidReportTransition } from '#reports/domain/report-transitions.js'
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

    if (!isValidReportTransition(report.status, REPORT_STATUS.DELETED)) {
      throw Boom.badRequest(
        `Cannot delete a report with status '${report.status}'`
      )
    }

    const previous = { status: report.status, version: report.version }

    await reportsRepository.deleteReport({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    await auditReportStatusTransition(request, {
      organisationId,
      reportId: report.id,
      previous,
      next: {
        status: REPORT_STATUS.DELETED,
        version: report.version + 1
      }
    })

    return h.response({}).code(StatusCodes.OK)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */
