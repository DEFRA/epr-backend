import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { auditReportStatusTransition } from '#reports/application/audit.js'
import { assertReportComplete } from '#reports/application/assert-report-complete.js'
import { fetchReportBySubmissionNumber } from '#reports/application/report-service.js'
import { reportOperatorCategory } from '#reports/domain/operator-category.js'
import { REPORT_STATUS, STATUS_TO_SLOT } from '#reports/domain/report-status.js'
import { assertNotStale } from '#reports/domain/stale.js'
import { isValidReportTransition } from '#reports/domain/report-transitions.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { extractChangedBy } from './shared.js'

const MIN_DECLARED_BY_LENGTH = 2
const MAX_DECLARED_BY_LENGTH = 255
const INVALID_DECLARED_BY_CHARS = /[@#$%&<>]/

const payloadSchema = Joi.object({
  status: Joi.string()
    .valid(
      REPORT_STATUS.IN_PROGRESS,
      REPORT_STATUS.READY_TO_SUBMIT,
      REPORT_STATUS.SUBMITTED
    )
    .required(),
  version: Joi.number().integer().min(1).required(),
  submissionDeclaredBy: Joi.string()
    .min(MIN_DECLARED_BY_LENGTH)
    .max(MAX_DECLARED_BY_LENGTH)
    .pattern(INVALID_DECLARED_BY_CHARS, { invert: true })
    .when('status', {
      is: REPORT_STATUS.SUBMITTED,
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
})

export const reportsStatus = {
  method: 'POST',
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      payload: payloadSchema
    }
  },
  /**
   * @param {ReportRequest & {
   *   payload: { status: ReportStatus, version: number, submissionDeclaredBy?: string },
   *   reportsRepository: ReportsRepository,
   *   systemLogsRepository: SystemLogsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { reportsRepository, params } = request
    const {
      organisationNumber,
      registrationNumber,
      cadence,
      year,
      period,
      submissionNumber
    } = params
    const { status, version, submissionDeclaredBy } = request.payload

    const report = await fetchReportBySubmissionNumber(
      reportsRepository,
      params,
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

    assertNotStale(report)

    if (!isValidReportTransition(report.status.currentStatus, status)) {
      throw Boom.badRequest(
        `Cannot transition from '${report.status.currentStatus}' to '${status}'`
      )
    }

    assertReportComplete(report, reportOperatorCategory(request.app))

    const updated = await reportsRepository.updateReportStatus({
      reportId: report.id,
      version,
      status,
      slot: STATUS_TO_SLOT[status],
      changedBy: extractChangedBy(request.auth.credentials),
      ...(submissionDeclaredBy !== undefined && { submissionDeclaredBy })
    })

    await auditReportStatusTransition(request, {
      organisationNumber,
      registrationNumber,
      accreditationNumber: report.accreditationNumber,
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
 * @import { ReportStatus } from '#reports/domain/report-status.js'
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 * @import { ReportRequest } from './shared.js'
 */
