import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { generateReportSubmissions } from '#reports/application/report-submissions.js'

export const getReportSubmissionsPath = '/v1/organisations/reports/submissions'

export const getReportSubmissions = {
  method: 'GET',
  path: getReportSubmissionsPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api', 'admin'],
    response: {
      schema: Joi.object({
        generatedAt: Joi.string().isoDate().required(),
        reportSubmissions: Joi.array()
          .items(
            Joi.object({
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
              submittedBy: Joi.string().allow('').required()
            })
          )
          .required()
      }),
      failAction: 'error'
    }
  },
  handler: async (request) => {
    const { organisationsRepository, reportsRepository } = request

    const result = await generateReportSubmissions(
      organisationsRepository,
      reportsRepository
    )

    return result
  }
}
