import { StatusCodes } from 'http-status-codes'

import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { findReportForPeriod } from '#reports/application/report-service.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails
} from './shared.js'

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsGetDetail = {
  method: 'GET',
  path: reportsGetDetailPath,
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
      packagingRecyclingNotesRepository,
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

    const prnData = await getIssuedTonnage(packagingRecyclingNotesRepository, {
      accreditationId: registration.accreditationId,
      startDate: report.startDate,
      endDate: report.endDate
    })

    return h
      .response({ ...withRegistrationDetails(report, registration), prnData })
      .code(StatusCodes.OK)
  }
}
