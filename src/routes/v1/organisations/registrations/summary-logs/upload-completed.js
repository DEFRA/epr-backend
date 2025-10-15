import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  determineFailureReason,
  determineStatusFromUpload,
  isValidTransition,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-log.js'

import { uploadCompletedPayloadSchema } from './upload-completed.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#workers/summary-logs/validator/summary-logs/validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

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

const buildSummaryLogData = (summaryLogId, upload, existingFile = null) => {
  const status = determineStatusFromUpload(upload.fileStatus)
  const failureReason = determineFailureReason(status, upload.errorMessage)

  const data = {
    id: summaryLogId,
    status,
    file: buildFileData(upload, existingFile)
  }

  if (failureReason) {
    data.failureReason = failureReason
  }

  return data
}

const upsertSummaryLog = async (
  summaryLogsRepository,
  summaryLogId,
  upload
) => {
  const existingSummaryLog = await summaryLogsRepository.findById(summaryLogId)
  const newStatus = determineStatusFromUpload(upload.fileStatus)

  if (existingSummaryLog) {
    if (!isValidTransition(existingSummaryLog.status, newStatus)) {
      throw Boom.conflict(
        `Cannot transition summary log ${summaryLogId} from ${existingSummaryLog.status} to ${newStatus}`
      )
    }

    const updates = buildSummaryLogData(
      summaryLogId,
      upload,
      existingSummaryLog.file
    )
    await summaryLogsRepository.update(
      summaryLogId,
      existingSummaryLog.version,
      updates
    )
  } else {
    const summaryLog = buildSummaryLogData(summaryLogId, upload)
    await summaryLogsRepository.insert(summaryLog)
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
      const status = await upsertSummaryLog(
        summaryLogsRepository,
        summaryLogId,
        summaryLogUpload
      )

      if (status === SUMMARY_LOG_STATUS.VALIDATING) {
        const summaryLog = await summaryLogsRepository.findById(summaryLogId)
        await summaryLogsValidator.validate(summaryLog)
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
