import { StatusCodes } from 'http-status-codes'

import { createReportForPeriod } from '#reports/application/report-service.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails,
  extractChangedBy
} from './shared.js'

export const reportsPostPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsPost = {
  method: 'POST',
  path: reportsPostPath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
    validate: {
      params: periodParamsSchema
    }
  },
  handler: async (request, h) => {
    const {
      organisationsRepository,
      wasteRecordsRepository,
      reportsRepository,
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const createdReport = await createReportForPeriod({
      reportsRepository,
      wasteRecordsRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period,
      changedBy: extractChangedBy(request.auth.credentials)
    })

    return h
      .response(withRegistrationDetails(createdReport, registration))
      .code(StatusCodes.CREATED)
  }
}
