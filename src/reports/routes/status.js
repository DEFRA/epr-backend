import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { auditReportStatusTransition } from '#reports/application/audit.js'
import { findReportForPeriod } from '#reports/application/report-service.js'
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
  handler: async (request, h) => {
    const {
      organisationsRepository,
      reportsRepository,
      wasteRecordsRepository,
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params
    const { status, version } = request.payload

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const { report } = await findReportForPeriod({
      reportsRepository,
      wasteRecordsRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period
    })

    if (!report.id) {
      throw Boom.notFound(
        `No report found for ${cadence} period ${period} of ${year}`
      )
    }

    if (!isValidReportTransition(report.status, status)) {
      throw Boom.badRequest(
        `Cannot transition from '${report.status}' to '${status}'`
      )
    }

    const previous = { status: report.status, version: report.version }

    await reportsRepository.updateReport({
      reportId: report.id,
      version,
      fields: { status },
      changedBy: extractChangedBy(request.auth.credentials)
    })

    const updated = await reportsRepository.findReportById(report.id)

    await auditReportStatusTransition(request, {
      organisationId,
      reportId: report.id,
      previous,
      next: { status: updated.status, version: updated.version }
    })

    return h.response(updated).code(StatusCodes.OK)
  }
}
