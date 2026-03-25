import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { findReportForPeriod } from '#reports/application/report-service.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  periodParamsSchema,
  standardUserAuth,
  extractChangedBy
} from './shared.js'

export const reportsPatchPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

const payloadSchema = Joi.object({
  status: Joi.string().valid(
    REPORT_STATUS.IN_PROGRESS,
    REPORT_STATUS.READY_TO_SUBMIT,
    REPORT_STATUS.SUBMITTED
  ),
  supportingInformation: Joi.string().allow('')
})
  .min(1)
  .required()

export const reportsPatch = {
  method: 'PATCH',
  path: reportsPatchPath,
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

    await reportsRepository.updateReport({
      reportId: report.id,
      version: report.version,
      fields: request.payload,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    const updated = await reportsRepository.findReportById(report.id)

    return h.response(updated).code(StatusCodes.OK)
  }
}
