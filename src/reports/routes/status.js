import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { auditReportStatusTransition } from '#reports/application/audit.js'
import { fetchCurrentReport } from '#reports/application/report-service.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { isValidReportTransition } from '#reports/domain/report-transitions.js'
import {
  periodParamsSchema,
  standardUserAuth,
  extractChangedBy
} from './shared.js'

export const reportsStatusPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}/status'

const payloadSchema = Joi.object({
  status: Joi.string()
    .valid(
      REPORT_STATUS.IN_PROGRESS,
      REPORT_STATUS.READY_TO_SUBMIT,
      REPORT_STATUS.SUBMITTED
    )
    .required(),
  version: Joi.number().integer().min(1).required()
})

export const reportsStatus = {
  method: 'POST',
  path: reportsStatusPath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
    validate: {
      params: periodParamsSchema,
      payload: payloadSchema
    }
  },
  /**
   * @param {HapiRequest<{ status: ReportStatus, version: number }> & { reportsRepository: ReportsRepository, systemLogsRepository: SystemLogsRepository }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { reportsRepository, params } = request
    const { organisationId, registrationId, cadence } = params
    const year = Number(params.year)
    const period = Number(params.period)
    const { status, version } = request.payload

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

    if (!isValidReportTransition(report.status.currentStatus, status)) {
      throw Boom.badRequest(
        `Cannot transition from '${report.status.currentStatus}' to '${status}'`
      )
    }

    const previous = await reportsRepository.findReportById(report.id)

    await reportsRepository.updateReportStatus({
      reportId: report.id,
      version,
      status,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    const updated = await reportsRepository.findReportById(report.id)

    await auditReportStatusTransition(request, {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber: previous.submissionNumber,
      reportId: report.id,
      previous,
      next: updated
    })

    return h
      .response({ status: updated.status.currentStatus })
      .code(StatusCodes.OK)
  }
}

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { ReportStatus } from '#reports/domain/report-status.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */
