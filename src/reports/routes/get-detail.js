import { StatusCodes } from 'http-status-codes'

import { fetchOrGenerateReportForPeriod } from '#reports/application/report-service.js'
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
      packagingRecyclingNotesRepository,
      reportsRepository,
      overseasSitesRepository,
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const report = await fetchOrGenerateReportForPeriod({
      reportsRepository,
      wasteRecordsRepository,
      packagingRecyclingNotesRepository,
      overseasSitesRepository,
      organisationId,
      registrationId,
      registration,
      year,
      cadence,
      period
    })

    const wasteReceivedRecordsExcluded =
      report.diagnostics?.wasteReceivedRecordsExcluded ?? 0
    if (wasteReceivedRecordsExcluded > 0) {
      request.logger.warn(
        {
          organisationId,
          registrationId,
          operatorCategory: report.operatorCategory,
          wasteReceivedRecordsExcluded
        },
        'Waste records excluded from report due to mismatched date field — possible registered-only to accredited transition (ADR 0030)'
      )
    }

    return h
      .response(withRegistrationDetails(report, registration))
      .code(StatusCodes.OK)
  }
}
