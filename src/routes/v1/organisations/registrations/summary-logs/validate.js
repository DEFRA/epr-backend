import Boom from '@hapi/boom'
import Joi from 'joi'
import { logger } from '#common/helpers/logging/logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { HTTP_STATUS } from '#common/enums/http-status.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */

const validateEndpointPayloadSchema = Joi.object({
  s3Bucket: Joi.string().required(),
  s3Key: Joi.string().required(),
  fileId: Joi.string().required(),
  filename: Joi.string().required()
})
  .unknown(true)
  .messages({
    'any.required': '{#label} is required',
    'string.empty': '{#label} cannot be empty'
  })

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
      payload: validateEndpointPayloadSchema,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },
  /**
   * @param {Object} request
   * @param {SummaryLogsRepository} request.summaryLogsRepository
   * @param {Object} request.payload
   * @param {Object} request.params
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ summaryLogsRepository, payload, params }, h) => {
    const { s3Bucket, s3Key, fileId, filename } = payload
    const { organisationId, registrationId } = params
    const s3Path = `${s3Bucket}/${s3Key}`

    try {
      await summaryLogsRepository.insert({
        fileId,
        organisationId,
        registrationId,
        filename,
        s3Bucket,
        s3Key
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
        .code(HTTP_STATUS.ACCEPTED)
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
