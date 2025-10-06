import Boom from '@hapi/boom'
import { logger } from '../../../../../common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../../../../common/enums/index.js'

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
  handler: async ({ summaryLogsRepository, payload }, h) => {
    const { s3Bucket, s3Key, fileId, filename } = payload
    const s3Path = `${s3Bucket}/${s3Key}`

    try {
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
        .code(202)
    } catch (err) {
      const message = `Failure on ${summaryLogsValidatePath}`

      logger.error(err, {
        message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: 500
          }
        }
      })

      throw Boom.badImplementation(message)
    }
  }
}
