import { StatusCodes } from 'http-status-codes'

import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails,
  findCurrentReportId
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
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    // Check for a stored report first
    const periodicReports = await reportsRepository.findPeriodicReports({
      organisationId,
      registrationId
    })

    const currentReportId = findCurrentReportId(
      periodicReports,
      year,
      cadence,
      period
    )

    if (currentReportId) {
      const storedReport =
        await reportsRepository.findReportById(currentReportId)
      return h
        .response(withRegistrationDetails(storedReport, registration))
        .code(StatusCodes.OK)
    }

    // No stored report — compute on the fly
    const operatorCategory = getOperatorCategory(registration)

    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )

    const report = aggregateReportDetail(wasteRecords, {
      operatorCategory,
      cadence,
      year,
      period
    })

    return h
      .response(withRegistrationDetails(report, registration))
      .code(StatusCodes.OK)
  }
}
