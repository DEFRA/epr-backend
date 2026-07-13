import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { REGULATOR_DISPLAY } from '#domain/organisations/model.js'
import { generateReportSubmissions } from '#reports/application/report-submissions.js'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */

export const getReportSubmissionsPath = '/v1/organisations/reports/submissions'

// A tonnage cell is a genuine number, or '' when there is no value to report.
const tonnageValue = Joi.number().allow('').required()

// A monetary cell is a genuine number, or '' when there is no value to report.
const monetaryValue = Joi.number().allow('').required()

export const getReportSubmissions = {
  method: 'GET',
  path: getReportSubmissionsPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    response: {
      schema: Joi.object({
        generatedAt: Joi.string().isoDate().required(),
        reportSubmissions: Joi.array()
          .items(
            Joi.object({
              regulator: Joi.string()
                .valid(...Object.values(REGULATOR_DISPLAY))
                .required(),
              organisationName: Joi.string().required(),
              submitterPhone: Joi.string().required(),
              approvedPersonsPhone: Joi.string().required(),
              submitterEmail: Joi.string().required(),
              approvedPersonsEmail: Joi.string().required(),
              material: Joi.string().required(),
              registrationNumber: Joi.string().required(),
              accreditationNumber: Joi.string().allow('').required(),
              reportType: Joi.string().required(),
              reportingPeriod: Joi.string().required(),
              dueDate: Joi.string().required(),
              submittedDate: Joi.string().allow('').required(),
              submittedBy: Joi.string().allow('').required(),
              submissionNumber: Joi.number().integer().allow('').required(),
              tonnageReceivedForRecycling: tonnageValue,
              tonnageRecycled: tonnageValue,
              tonnageExportedForRecycling: tonnageValue,
              tonnageSentOnTotal: tonnageValue,
              tonnageSentOnToReprocessor: tonnageValue,
              tonnageSentOnToExporter: tonnageValue,
              tonnageSentOnToOtherFacilities: tonnageValue,
              tonnagePrnsPernsIssued: tonnageValue,
              freeTonnagePrnsPerns: tonnageValue,
              totalRevenuePrnsPerns: monetaryValue,
              averagePrnPernPricePerTonne: monetaryValue,
              tonnageReceivedButNotRecycled: tonnageValue,
              tonnageReceivedButNotExported: tonnageValue,
              tonnageExportedThatWasStopped: tonnageValue,
              tonnageExportedThatWasRefused: tonnageValue,
              tonnageRepatriated: tonnageValue,
              noteToRegulator: Joi.string().allow('').required()
            })
          )
          .required()
      }),
      failAction: 'error'
    }
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   reportsRepository: ReportsRepository
   * }} request
   */
  handler: async (request) => {
    const { organisationsRepository, reportsRepository } = request

    const result = await generateReportSubmissions(
      organisationsRepository,
      reportsRepository
    )

    return result
  }
}
