import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  determineFailureReason,
  determineStatusFromUpload,
  SUMMARY_LOG_STATUS,
  transitionStatus,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { uploadCompletedPayloadSchema } from './post.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/summary-logs/validator/port.js').SummaryLogsValidator} SummaryLogsValidator */
/** @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger */
/** @typedef {import('./post.schema.js').SummaryLogUpload} SummaryLogUpload */

const buildFileData = (upload, existingFile = null) => {
  const { fileId, filename, fileStatus, s3Bucket, s3Key } = upload

  const fileData = existingFile
    ? { ...existingFile, id: fileId, name: filename, status: fileStatus }
    : { id: fileId, name: filename, status: fileStatus }

  if (fileStatus === UPLOAD_STATUS.COMPLETE) {
    fileData.s3 = { bucket: s3Bucket, key: s3Key }
  }

  return fileData
}

const buildSummaryLogData = (upload, existingFile = null) => {
  const status = determineStatusFromUpload(upload.fileStatus)
  const failureReason = determineFailureReason(status, upload.errorMessage)

  const data = {
    status,
    file: buildFileData(upload, existingFile)
  }

  if (failureReason) {
    data.failureReason = failureReason
  }

  return data
}

/**
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {string} summaryLogId
 * @param {SummaryLogUpload} upload
 * @param {TypedLogger} logger
 * @returns {Promise<string>} The new status
 */
const updateStatusBasedOnUpload = async (
  summaryLogsRepository,
  summaryLogId,
  upload,
  logger
) => {
  const existing = await summaryLogsRepository.findById(summaryLogId)
  const newStatus = determineStatusFromUpload(upload.fileStatus)

  if (existing) {
    const { version, summaryLog } = existing
    try {
      transitionStatus(summaryLog, newStatus)
    } catch (error) {
      logger.error({
        message: error.message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE,
          reference: summaryLogId
        },
        http: {
          response: {
            status_code: StatusCodes.CONFLICT
          }
        }
      })

      throw Boom.conflict(error.message)
    }

    const updates = buildSummaryLogData(upload, summaryLog.file)
    await summaryLogsRepository.update(summaryLogId, version, updates)
  } else {
    const summaryLog = buildSummaryLogData(upload)
    await summaryLogsRepository.insert(summaryLogId, summaryLog)
  }

  return newStatus
}

const formatS3Info = (upload) =>
  upload.fileStatus === UPLOAD_STATUS.COMPLETE &&
  upload.s3Bucket &&
  upload.s3Key
    ? `, s3Bucket=${upload.s3Bucket}, s3Key=${upload.s3Key}`
    : ''

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
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository} & {summaryLogsValidator: SummaryLogsValidator}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      summaryLogsValidator,
      payload,
      params,
      logger
    } = request

    const { summaryLogId } = params
    const { summaryLogUpload } = payload.form

    try {
      const status = await updateStatusBasedOnUpload(
        summaryLogsRepository,
        summaryLogId,
        summaryLogUpload,
        logger
      )

      if (status === SUMMARY_LOG_STATUS.VALIDATING) {
        const { version, summaryLog } =
          await summaryLogsRepository.findById(summaryLogId)
        await summaryLogsValidator.validate({
          id: summaryLogId,
          version,
          summaryLog
        })
      }

      const s3Info = formatS3Info(summaryLogUpload)

      logger.info({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${summaryLogUpload.fileId}, filename=${summaryLogUpload.filename}, status=${summaryLogUpload.fileStatus}${s3Info}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })

      return h.response().code(StatusCodes.ACCEPTED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${summaryLogsUploadCompletedPath}`,
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

      throw Boom.badImplementation(
        `Failure on ${summaryLogsUploadCompletedPath}`
      )
    }
  }
}
