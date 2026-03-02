import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { generateSummaryLogUploadsReport } from '#application/summary-log-uploads-report/generate-report.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import Boom from '@hapi/boom'
import { summaryLogUploadsReportResponseSchema } from './response.schema.js'

/**
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository
 */

export const summaryLogUploadsReportPath =
  '/v1/organisations/registrations/summary-logs/reports/uploads'

export const getSummaryLogUploadsReport = {
  method: 'GET',
  path: summaryLogUploadsReportPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    response: {
      schema: summaryLogUploadsReportResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, summaryLogsRepository, logger } = request
    try {
      const reportData = await generateSummaryLogUploadsReport(
        organisationsRepository,
        summaryLogsRepository
      )

      logger.info({
        message: 'Summary log uploads report generated successfully',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(reportData).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${summaryLogUploadsReportPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(`Failure on ${summaryLogUploadsReportPath}`)
    }
  }
}
