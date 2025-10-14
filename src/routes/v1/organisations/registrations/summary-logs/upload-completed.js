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

/** @typedef {import('#repositories/summary-logs-repository.port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#workers/summary-logs/validator/summary-logs-validator.port.js').SummaryLogsValidator} SummaryLogsValidator */

const buildFileData = (fileDetails, existingFile = null) => {
  const { fileId, filename, fileStatus, s3Bucket, s3Key } = fileDetails

  const fileData = existingFile
    ? { ...existingFile, id: fileId, name: filename, status: fileStatus }
    : { id: fileId, name: filename, status: fileStatus }

  if (fileStatus === UPLOAD_STATUS.COMPLETE) {
    fileData.s3 = {
      bucket: s3Bucket,
      key: s3Key
    }
  }

  return fileData
}

const buildSummaryLogData = (newStatus, fileDetails) => {
  const failureReason = determineFailureReason(
    newStatus,
    fileDetails.errorMessage
  )

  const data = {
    status: newStatus,
    file: buildFileData(fileDetails)
  }

  if (failureReason) {
    data.failureReason = failureReason
  }

  return data
}

const updateExistingSummaryLog = async (
  summaryLogsRepository,
  summaryLogId,
  existingSummaryLog,
  newStatus,
  fileDetails
) => {
  if (!isValidTransition(existingSummaryLog.status, newStatus)) {
    throw Boom.conflict(
      `Cannot transition summary log ${summaryLogId} from ${existingSummaryLog.status} to ${newStatus}`
    )
  }

  const updates = {
    ...buildSummaryLogData(newStatus, fileDetails),
    file: buildFileData(fileDetails, existingSummaryLog.file)
  }

  await summaryLogsRepository.update(summaryLogId, updates)
}

const insertNewSummaryLog = async (
  summaryLogsRepository,
  summaryLogId,
  newStatus,
  fileDetails
) => {
  const summaryLog = {
    id: summaryLogId,
    ...buildSummaryLogData(newStatus, fileDetails)
  }

  await summaryLogsRepository.insert(summaryLog)
}

const formatS3Info = (fileDetails) => {
  const { fileStatus, s3Bucket, s3Key } = fileDetails
  return fileStatus === UPLOAD_STATUS.COMPLETE && s3Bucket && s3Key
    ? `, s3Bucket=${s3Bucket}, s3Key=${s3Key}`
    : ''
}

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

    const {
      form: { summaryLogUpload }
    } = payload

    const { fileId, filename, fileStatus, s3Bucket, s3Key, errorMessage } =
      summaryLogUpload

    const fileDetails = {
      fileId,
      filename,
      fileStatus,
      s3Bucket,
      s3Key,
      errorMessage
    }

    try {
      const existingSummaryLog =
        await summaryLogsRepository.findById(summaryLogId)
      const newStatus = determineStatusFromUpload(fileStatus)

      if (existingSummaryLog) {
        await updateExistingSummaryLog(
          summaryLogsRepository,
          summaryLogId,
          existingSummaryLog,
          newStatus,
          fileDetails
        )
      } else {
        await insertNewSummaryLog(
          summaryLogsRepository,
          summaryLogId,
          newStatus,
          fileDetails
        )
      }

      if (newStatus === SUMMARY_LOG_STATUS.VALIDATING) {
        const summaryLog = await summaryLogsRepository.findById(summaryLogId)
        await summaryLogsValidator.validate(summaryLog)
      }

      const s3Info = formatS3Info(fileDetails)

      logger.info({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${fileStatus}${s3Info}`,
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

      const message = `Failure on ${summaryLogsUploadCompletedPath}`

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
