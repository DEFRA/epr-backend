import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { QUARTERLY } from '#reports/domain/cadence.js'
import {
  getOperatorCategory,
  OPERATOR_CATEGORY
} from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{period}'

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
        year: Joi.number().integer().min(2024).max(2100).required(),
        period: Joi.number().integer().min(1).max(12).required()
      })
    }
  },
  handler: async (request, h) => {
    const { organisationsRepository, wasteRecordsRepository, params } = request
    const { organisationId, registrationId, year, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const operatorCategory = getOperatorCategory(registration)

    if (operatorCategory !== OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY) {
      throw Boom.notFound()
    }

    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )

    const report = aggregateReportDetail(wasteRecords, {
      operatorCategory,
      cadence: QUARTERLY,
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
