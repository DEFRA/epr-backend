import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'
import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

const MIN_YEAR = 2024
const MAX_YEAR = 2100

export const reportsGetDetail = {
  method: 'GET',
  path: reportsGetDetailPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
        cadence: cadenceSchema,
        period: periodSchema
      })
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

    const periodicReport = periodicReports.find((pr) => pr.year === year)
    const slot = periodicReport?.reports?.[cadence]?.[period]

    if (slot?.currentReportId) {
      const storedReport = await reportsRepository.findReportById(
        slot.currentReportId
      )
      return h
        .response({
          ...storedReport,
          details: {
            material: registration.material,
            site: registration.site
          }
        })
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
      .response({
        ...report,
        details: {
          material: registration.material,
          site: registration.site
        }
      })
      .code(StatusCodes.OK)
  }
}
