import {
  createRejectedValidation,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { CDP_FILE_STATUS, CDP_UPLOAD_STATUS } from './status.js'

/** @typedef {import('./status.js').CdpUploader} CdpUploader */
/** @typedef {import('./status.js').CdpUploadStatusResponse} CdpUploadStatusResponse */
/** @typedef {import('#repositories/summary-logs/port.js').SummaryLogsRepository} SummaryLogsRepository */

/**
 * Extracts the file field from a CDP Uploader status response.
 *
 * @param {CdpUploadStatusResponse} cdpUploaderStatus
 * @returns {{ fileId: string, fileStatus: string, errorMessage?: string } | null}
 */
const extractFileField = (cdpUploaderStatus) => {
  const { form } = cdpUploaderStatus

  if (!form) {
    return null
  }

  return Object.values(form).find((field) => field.fileId) ?? null
}

/**
 * @typedef {Object} CdpUploaderState
 * @property {string} uploadStatus
 * @property {string | null} fileStatus
 * @property {string} [errorMessage]
 */

/**
 * Fetches the current state from CDP Uploader.
 *
 * @param {string} uploadId
 * @param {CdpUploader} cdpUploader
 * @returns {Promise<CdpUploaderState | null>}
 */
export const getCdpUploaderState = async (uploadId, cdpUploader) => {
  const uploadStatus = await cdpUploader.getUploadStatus(uploadId)

  if (!uploadStatus) {
    return null
  }

  const fileField = extractFileField(uploadStatus)

  return {
    uploadStatus: uploadStatus.uploadStatus,
    fileStatus: fileField?.fileStatus ?? null,
    errorMessage: fileField?.errorMessage
  }
}

/**
 * Determines the target status based on CDP Uploader state.
 *
 * @param {CdpUploaderState} cdpUploaderState
 * @returns {string}
 */
const determineTargetStatus = (cdpUploaderState) => {
  if (cdpUploaderState.fileStatus === CDP_FILE_STATUS.REJECTED) {
    return SUMMARY_LOG_STATUS.REJECTED
  }
  return SUMMARY_LOG_STATUS.VALIDATION_FAILED
}

/**
 * Reconciles a summary log's status with CDP Uploader when the status appears stuck.
 * This handles cases where the CDP callback was missed (e.g., config issue, server restart).
 *
 * @param {Object} options
 * @param {string} options.summaryLogId
 * @param {string} options.uploadId
 * @param {SummaryLogsRepository} options.summaryLogsRepository
 * @param {CdpUploader} options.cdpUploader
 * @returns {Promise<{ status: string, expiresAt: Date|null, validation?: Object } | null>} Updated summary log data, or null if no update needed
 */
export const reconcileWithCdpUploader = async ({
  summaryLogId,
  uploadId,
  summaryLogsRepository,
  cdpUploader
}) => {
  const cdpUploaderState = await getCdpUploaderState(uploadId, cdpUploader)

  // Check if CDP indicates the upload is ready with a known file status
  const isReadyForReconciliation =
    cdpUploaderState?.uploadStatus === CDP_UPLOAD_STATUS.READY &&
    cdpUploaderState?.fileStatus

  if (!isReadyForReconciliation) {
    return null
  }

  // Re-fetch the summary log to check current status (race condition protection)
  const result = await summaryLogsRepository.findById(summaryLogId)
  if (!result) {
    return null
  }

  const { version, summaryLog: currentSummaryLog } = result

  // Only update if still in preprocessing (callback may have arrived while we were checking)
  if (currentSummaryLog.status !== SUMMARY_LOG_STATUS.PREPROCESSING) {
    return currentSummaryLog
  }

  const targetStatus = determineTargetStatus(cdpUploaderState)
  const statusUpdate = transitionStatus(currentSummaryLog, targetStatus)

  const reconciledSummaryLog =
    cdpUploaderState.fileStatus === CDP_FILE_STATUS.REJECTED
      ? {
          ...statusUpdate,
          validation: createRejectedValidation(cdpUploaderState.errorMessage)
        }
      : statusUpdate

  await summaryLogsRepository.update(
    summaryLogId,
    version,
    reconciledSummaryLog
  )

  return reconciledSummaryLog
}
