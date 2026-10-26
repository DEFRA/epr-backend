import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { findRegistrationByNumber } from '#routes/organisations/natural-keys.js'
import {
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { summaryLogsListResponseSchema } from './response.schema.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/view-route.js' */

const LIST_FAILURE = 'Failure listing summary logs'

export const summaryLogsList = {
  method: 'GET',
  path: `${registrationPath}/summary-logs`,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    validate: { params: Joi.object(registrationParams) },
    response: {
      schema: summaryLogsListResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: RegistrationParams,
   *   organisationsRepository: OrganisationsRepository,
   *   summaryLogsRepository: SummaryLogsRepository
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, summaryLogsRepository, params, logger } =
      request
    const { organisationNumber, registrationNumber } = params

    await findRegistrationByNumber(
      organisationsRepository,
      organisationNumber,
      registrationNumber
    )

    try {
      const summaryLogs = await summaryLogsRepository.findAll({
        organisationNumber,
        registrationNumber
      })

      const summaryLogList = summaryLogs.map(({ id, summaryLog }) => ({
        summaryLogId: id,
        filename: summaryLog.file.name,
        uploadedAt: summaryLog.submittedAt ?? summaryLog.createdAt,
        status: summaryLog.status,
        ...(summaryLog.year !== undefined && { year: summaryLog.year })
      }))

      logger.info({
        message: `Summary log list retrieved: organisationNumber=${organisationNumber}, registrationNumber=${registrationNumber}, count=${summaryLogs.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response({ summaryLogs: summaryLogList }).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: LIST_FAILURE,
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

      throw Boom.badImplementation(LIST_FAILURE)
    }
  }
}
