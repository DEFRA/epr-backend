import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  determineFailureReason,
  determineStatusFromUpload,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-log.js'

import { uploadCompletedPayloadSchema } from './upload-completed.schema.js'

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#workers/summary-logs/validator/summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

export const summaryLogsUploadCompletedPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/upload-completed'

export const summaryLogsUploadCompleted = {
  method: 'POST',
  path: summaryLogsUploadCompletedPath,
  options: {
    validate: {
      payload: uploadCompletedPayloadSchema,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { summaryLogsRepository, summaryLogsValidator, payload, params } =
      request
    const { summaryLogId } = params
    const {
      summaryLogUpload: { fileId, filename, fileStatus, s3Bucket, s3Key }
    } = payload.form

    const existingSummaryLog =
      await summaryLogsRepository.findById(summaryLogId)

    if (existingSummaryLog) {
      throw Boom.conflict(
        `Summary log ${summaryLogId} already exists with status ${existingSummaryLog.status}`
      )
    }

    const status = determineStatusFromUpload(fileStatus)
    const failureReason = determineFailureReason(status)

    const fileData = {
      id: fileId,
      name: filename,
      status: fileStatus
    }

    if (fileStatus === UPLOAD_STATUS.COMPLETE) {
      fileData.s3 = {
        bucket: s3Bucket,
        key: s3Key
      }
    }

    const summaryLog = {
      id: summaryLogId,
      status,
      file: fileData
    }

    if (failureReason) {
      summaryLog.failureReason = failureReason
    }

    await summaryLogsRepository.insert(summaryLog)

    if (status === SUMMARY_LOG_STATUS.VALIDATING) {
      await summaryLogsValidator.validate(summaryLog)
    }

    return h.response().code(StatusCodes.OK)
  }
}
