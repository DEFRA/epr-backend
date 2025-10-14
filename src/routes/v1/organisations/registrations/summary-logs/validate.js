import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-log.js'

/** @typedef {import('#repositories/summary-logs-repository/port.js').SummaryLogsRepository} SummaryLogsRepository */

export const summaryLogsValidatePath =
  '/v1/organisation/{organisationId}/registration/{registrationId}/summary-logs/validate'

/**
 * Summary Logs: Validate
 * Accepts Summary Log S3 objects for validation.
 */
export const summaryLogsValidate = {
  method: 'POST',
  path: summaryLogsValidatePath,
  options: {
    validate: {
      payload: (data, _options) => {
        if (!data || typeof data !== 'object') {
          throw Boom.badRequest('Invalid payload')
        }

        const { s3Bucket, s3Key, fileId, filename } = data

        if (!s3Bucket) {
          throw Boom.badData('s3Bucket is missing in body.data')
        }

        if (!s3Key) {
          throw Boom.badData('s3Key is missing in body.data')
        }

        if (!fileId) {
          throw Boom.badData('fileId is missing in body.data')
        }

        if (!filename) {
          throw Boom.badData('filename is missing in body.data')
        }

        return {
          s3Bucket,
          s3Key,
          fileId,
          filename
        }
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, payload, params, logger }, h) => {
    const { s3Bucket, s3Key, fileId, filename } = payload
    const { organisationId, registrationId } = params
    const s3Path = `${s3Bucket}/${s3Key}`

    try {
      await summaryLogsRepository.insert({
        id: randomUUID(),
        status: SUMMARY_LOG_STATUS.VALIDATING,
        organisationId,
        registrationId,
        file: {
          id: fileId,
          name: filename,
          s3: {
            bucket: s3Bucket,
            key: s3Key
          }
        }
      })

      logger.info({
        message: `Initiating file validation for ${s3Path} with fileId: ${fileId} and filename: ${filename}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h
        .response({
          status: 'validating'
        })
        .code(StatusCodes.ACCEPTED)
    } catch (error) {
      const message = `Failure on ${summaryLogsValidatePath}`

      logger.error({
        error,
        message,
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

      throw Boom.badImplementation(message)
    }
  }
}
