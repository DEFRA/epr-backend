import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { MONTHLY, QUARTERLY } from '#reports/domain/cadence.js'
import {
  getOperatorCategory,
  OPERATOR_CATEGORY
} from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'

export const reportsGetDetailPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{period}'

const MIN_YEAR = 2024
const MAX_YEAR = 2100
const MAX_PERIOD = 12

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
        period: Joi.number().integer().min(1).max(MAX_PERIOD).required()
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

    /**
     * Accredited Operators report Monthly, Registered-Only report Quarterly
     *
     * This is currently a simple binary check - when the accreditation entity
     * gains status/date fields (approvedAt, cancelledAt, suspendedAt), this
     * will need to account for mid-quarter transitions:
     *   - Accreditation mid-quarter → entire quarter becomes monthly
     *   - Cancellation → monthly continues until first full quarter without accreditation
     *   - Suspension → monthly continues (no change)
     */
    const isAccredited =
      operatorCategory === OPERATOR_CATEGORY.REPROCESSOR ||
      operatorCategory === OPERATOR_CATEGORY.EXPORTER

    const cadence = isAccredited ? MONTHLY : QUARTERLY

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
