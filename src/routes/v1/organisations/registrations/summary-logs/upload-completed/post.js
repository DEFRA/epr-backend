import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  createRejectedValidation,
  determineStatusFromUpload,
  SUMMARY_LOG_STATUS,
  transitionStatus,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'

import { uploadCompletedPayloadSchema } from './post.schema.js'

/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */
/** @typedef {import('#domain/summary-logs/worker/port.js').SummaryLogsCommandExecutor} SummaryLogsCommandExecutor */
/** @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger */
/** @typedef {import('./post.schema.js').SummaryLogUpload} SummaryLogUpload */

const buildFileData = (upload, existingFile) => {
  const { fileId, filename, fileStatus, s3Bucket, s3Key } = upload

  const fileData = existingFile
    ? { ...existingFile, id: fileId, name: filename, status: fileStatus }
    : { id: fileId, name: filename, status: fileStatus }

  if (fileStatus === UPLOAD_STATUS.COMPLETE) {
    fileData.uri = `s3://${s3Bucket}/${s3Key}`
  }

  return fileData
}

const buildSummaryLogData = (
  upload,
  existingFile,
  organisationId,
  registrationId
) => {
  const status = determineStatusFromUpload(upload.fileStatus)

  const data = {
    status,
    file: buildFileData(upload, existingFile),
    organisationId,
    registrationId
  }

  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    data.validation = createRejectedValidation(upload.errorMessage)
  }

  return data
}

/**
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {string} summaryLogId
 * @param {SummaryLogUpload} upload
 * @param {TypedLogger} logger
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<string>} The new status
 */
const updateStatusBasedOnUpload = async (
  summaryLogsRepository,
  summaryLogId,
  upload,
  logger,
  organisationId,
  registrationId
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

    const updates = buildSummaryLogData(
      upload,
      summaryLog.file,
      organisationId,
      registrationId
    )
    await summaryLogsRepository.update(summaryLogId, version, updates)
  } else {
    const summaryLog = buildSummaryLogData(
      upload,
      undefined,
      organisationId,
      registrationId
    )
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

/**
 * Check for submission blocks and supersede pending logs if upload completed successfully.
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} summaryLogId
 * @param {string} newStatus
 * @param {TypedLogger} logger
 */
const handlePendingLogsOnValidation = async (
  summaryLogsRepository,
  organisationId,
  registrationId,
  summaryLogId,
  newStatus,
  logger
) => {
  if (newStatus !== SUMMARY_LOG_STATUS.VALIDATING) {
    return
  }

  // Block if a submission is in progress
  const hasSubmitting = await summaryLogsRepository.hasSubmittingLog(
    organisationId,
    registrationId
  )
  if (hasSubmitting) {
    throw Boom.conflict('A submission is in progress. Please wait.')
  }

  // Supersede any pending logs for this org/reg
  const supersededCount = await summaryLogsRepository.supersedePendingLogs(
    organisationId,
    registrationId,
    summaryLogId
  )
  if (supersededCount > 0) {
    logger.info({
      message: `Superseded ${supersededCount} pending summary logs for organisationId=${organisationId}, registrationId=${registrationId}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.SUMMARY_LOG_SUPERSEDED,
        reference: summaryLogId
      }
    })
  }
}

export const summaryLogsUploadCompletedPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/upload-completed'

export const summaryLogsUploadCompleted = {
  method: 'POST',
  path: summaryLogsUploadCompletedPath,
  options: {
    auth: false,
    validate: {
      payload: uploadCompletedPayloadSchema,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {summaryLogsRepository: SummaryLogsRepository} & {summaryLogsWorker: SummaryLogsCommandExecutor}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      summaryLogsRepository,
      summaryLogsWorker,
      payload,
      params,
      logger
    } = request

    const { summaryLogId, organisationId, registrationId } = params
    const { summaryLogUpload } = payload.form

    try {
      const newStatus = determineStatusFromUpload(summaryLogUpload.fileStatus)

      await handlePendingLogsOnValidation(
        summaryLogsRepository,
        organisationId,
        registrationId,
        summaryLogId,
        newStatus,
        logger
      )

      const status = await updateStatusBasedOnUpload(
        summaryLogsRepository,
        summaryLogId,
        summaryLogUpload,
        logger,
        organisationId,
        registrationId
      )

      if (status === SUMMARY_LOG_STATUS.VALIDATING) {
        await summaryLogsWorker.validate(summaryLogId)
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
