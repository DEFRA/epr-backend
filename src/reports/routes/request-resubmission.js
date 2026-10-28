import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { auditReportRequestResubmission } from '#reports/application/audit.js'
import { requestOperatorResubmission } from '#reports/application/resubmission-service.js'
import { extractChangedBy } from './shared.js'

/**
 * Lets an operator self-trigger resubmission on their own submitted report.
 * Operator-scoped, unlike `unsubmit` which is admin-scoped.
 */
export const reportsRequestResubmission = {
  method: 'POST',
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api']
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
    const {
      organisationId,
      registrationId,
      cadence,
      year,
      period,
      submissionNumber
    } = params

    const result = await requestOperatorResubmission({
      reportsRepository,
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      requestedBy: extractChangedBy(request.auth.credentials)
    })

    await auditReportRequestResubmission(request, {
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      submissionNumber,
      reportId: result.reportId,
      resubmissionRequired: result.resubmissionRequired
    })

    return h.response({ status: 'requires_resubmission' }).code(StatusCodes.OK)
  }
}

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 * @import { PeriodWithSubmissionPathParams } from './shared.js'
 */
