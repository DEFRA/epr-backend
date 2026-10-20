import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { atDatabaseIds } from '#routes/organisations/at-database-ids.js'
import { summaryLogsListResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { RegistrationParams } from '#routes/organisations/view-route.js' */

export const summaryLogsListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs'

/**
 * @param {Organisation} organisation
 * @returns {(accreditationNumber: string | null) => string | null | undefined}
 */
const accreditationIdIn = (organisation) => {
  const ids = new Map(
    organisation.accreditations.map(({ id, accreditationNumber }) => [
      accreditationNumber,
      id
    ])
  )
  return (accreditationNumber) =>
    accreditationNumber && ids.get(accreditationNumber)
}

const summaryLogsListByNumber = {
  method: 'GET',
  path: summaryLogsListPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    response: {
      schema: summaryLogsListResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: RegistrationParams,
   *   app: { organisation: Organisation },
   *   summaryLogsRepository: SummaryLogsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, params, logger } = request
    const { organisationNumber, registrationNumber } = params
    const accreditationIdFor = accreditationIdIn(request.app.organisation)

    try {
      const summaryLogs = await summaryLogsRepository.findAll({
        organisationNumber: String(organisationNumber),
        registrationNumber
      })

      const summaryLogList = summaryLogs.map(({ id, summaryLog }) => ({
        summaryLogId: id,
        filename: summaryLog.file.name,
        uploadedAt: summaryLog.submittedAt ?? summaryLog.createdAt,
        status: summaryLog.status,
        ...(summaryLog.year !== undefined && { year: summaryLog.year }),
        ...(summaryLog.accreditationNumber !== undefined && {
          accreditationId: accreditationIdFor(summaryLog.accreditationNumber)
        })
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
        message: `Failure on ${summaryLogsListPath}`,
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

      throw Boom.badImplementation(`Failure on ${summaryLogsListPath}`)
    }
  }
}

export const summaryLogsList = atDatabaseIds(summaryLogsListByNumber, {
  unknown: (_request, h) => h.response({ summaryLogs: [] }).code(StatusCodes.OK)
})
