import { StatusCodes } from 'http-status-codes'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  getOperatorCategory,
  OPERATOR_CATEGORY
} from '#reports/domain/operator-category.js'
import { findReportForPeriod } from '#reports/application/report-service.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails
} from './shared.js'

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

async function getPrnData(
  isAccredited,
  packagingRecyclingNotesRepository,
  organisationId,
  registrationId,
  report
) {
  return isAccredited
    ? {
        issuedTonnage:
          await packagingRecyclingNotesRepository.getTotalIssuedTonnage({
            organisationId,
            registrationId,
            statuses: [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED],
            startDate: new Date(report.startDate),
            endDate: new Date(report.endDate + 'T23:59:59.999Z')
          })
      }
    : undefined
}

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
    const isAccredited =
      operatorCategory === OPERATOR_CATEGORY.EXPORTER ||
      operatorCategory === OPERATOR_CATEGORY.REPROCESSOR

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

    const prnData = await getPrnData(
      isAccredited,
      packagingRecyclingNotesRepository,
      organisationId,
      registrationId,
      report
    )

    return h
      .response({ ...withRegistrationDetails(report, registration), prnData })
      .code(StatusCodes.OK)
  }
}
