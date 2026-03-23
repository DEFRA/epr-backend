import { StatusCodes } from 'http-status-codes'

import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
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

    const operatorCategory = getOperatorCategory(registration)

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
      statuses: [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED],
      startDate: report.startDate,
      endDate: report.endDate
    })

    return h
      .response({ ...withRegistrationDetails(report, registration), prnData })
      .code(StatusCodes.OK)
  }
}
