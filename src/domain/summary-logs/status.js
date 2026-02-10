import { VALIDATION_CODE } from '#common/enums/validation.js'

export const SUMMARY_LOG_STATUS = Object.freeze({
  PREPROCESSING: 'preprocessing',
  REJECTED: 'rejected',
  VALIDATING: 'validating',
  INVALID: 'invalid',
  VALIDATED: 'validated',
  SUBMITTING: 'submitting',
  SUBMITTED: 'submitted',
  SUPERSEDED: 'superseded',
  VALIDATION_FAILED: 'validation_failed',
  SUBMISSION_FAILED: 'submission_failed'
})

export const SUMMARY_LOG_FAILURE_STATUS = [
  SUMMARY_LOG_STATUS.REJECTED,
  SUMMARY_LOG_STATUS.INVALID,
  SUMMARY_LOG_STATUS.VALIDATION_FAILED,
  SUMMARY_LOG_STATUS.SUBMISSION_FAILED
]

// TTL calculation constants
const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7

const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY
const MILLISECONDS_PER_WEEK = MILLISECONDS_PER_DAY * DAYS_PER_WEEK

const minutes = (n) => n * MILLISECONDS_PER_MINUTE
const days = (n) => n * MILLISECONDS_PER_DAY
const weeks = (n) => n * MILLISECONDS_PER_WEEK

// TTL duration values - brief window for worker processing
const SUBMITTING_TIMEOUT_MINUTES = 20

const STATUS_TO_TTL = {
  [SUMMARY_LOG_STATUS.PREPROCESSING]: days(1),
  [SUMMARY_LOG_STATUS.VALIDATING]: days(1),
  [SUMMARY_LOG_STATUS.VALIDATED]: weeks(1),
  [SUMMARY_LOG_STATUS.SUPERSEDED]: days(1),
  [SUMMARY_LOG_STATUS.REJECTED]: days(1),
  [SUMMARY_LOG_STATUS.INVALID]: weeks(1),
  [SUMMARY_LOG_STATUS.VALIDATION_FAILED]: days(1),
  [SUMMARY_LOG_STATUS.SUBMISSION_FAILED]: days(1),
  [SUMMARY_LOG_STATUS.SUBMITTING]: minutes(SUBMITTING_TIMEOUT_MINUTES),
  [SUMMARY_LOG_STATUS.SUBMITTED]: null
}

/**
 * Calculates the expiry date for a summary log based on its status.
 * @param {string} status - The summary log status
 * @returns {Date|null} - The expiry date, or null if the document should never expire
 * @throws {Error} - If the status is unknown
 */
export const calculateExpiresAt = (status) => {
  if (!(status in STATUS_TO_TTL)) {
    throw new Error(`Unknown status for TTL calculation: ${status}`)
  }

  const ttl = STATUS_TO_TTL[status]
  if (ttl === null) {
    return null
  }

  return new Date(Date.now() + ttl)
}

/**
 * Sentinel value indicating this is the first submission for an org/reg pair.
 * Used in `validatedAgainstSummaryLogId` when no prior submitted summary log exists.
 */
export const NO_PRIOR_SUBMISSION = 'NO_PRIOR_SUBMISSION'

/**
 * Commands that can be sent to the summary log worker thread.
 */
export const SUMMARY_LOG_COMMAND = Object.freeze({
  VALIDATE: 'validate',
  SUBMIT: 'submit'
})

/**
 * Statuses that indicate a summary log is still being validated.
 * Used by the timeout tracker to determine if a failed/timed-out task
 * should be marked as validation_failed.
 */
export const PROCESSING_STATUSES = Object.freeze([
  SUMMARY_LOG_STATUS.PREPROCESSING,
  SUMMARY_LOG_STATUS.VALIDATING
])

/**
 * Statuses that indicate a summary log is still being submitted.
 * Used by the timeout tracker to determine if a failed/timed-out task
 * should be marked as submission_failed.
 */
export const SUBMISSION_PROCESSING_STATUSES = Object.freeze([
  SUMMARY_LOG_STATUS.SUBMITTING
])

/**
 * @typedef {typeof SUMMARY_LOG_STATUS[keyof typeof SUMMARY_LOG_STATUS]} SummaryLogStatus
 */

export const UPLOAD_STATUS = Object.freeze({
  COMPLETE: 'complete',
  REJECTED: 'rejected',
  PENDING: 'pending'
})

/**
 * @typedef {typeof UPLOAD_STATUS[keyof typeof UPLOAD_STATUS]} UploadStatus
 */

const UploadStatusToSummaryLogStatusMap = {
  [UPLOAD_STATUS.REJECTED]: SUMMARY_LOG_STATUS.REJECTED,
  [UPLOAD_STATUS.PENDING]: SUMMARY_LOG_STATUS.PREPROCESSING,
  [UPLOAD_STATUS.COMPLETE]: SUMMARY_LOG_STATUS.VALIDATING
}

const VALID_TRANSITIONS = {
  [SUMMARY_LOG_STATUS.PREPROCESSING]: [
    SUMMARY_LOG_STATUS.PREPROCESSING,
    SUMMARY_LOG_STATUS.REJECTED,
    SUMMARY_LOG_STATUS.VALIDATING,
    SUMMARY_LOG_STATUS.VALIDATION_FAILED
  ],
  [SUMMARY_LOG_STATUS.VALIDATING]: [
    SUMMARY_LOG_STATUS.VALIDATED,
    SUMMARY_LOG_STATUS.INVALID,
    SUMMARY_LOG_STATUS.VALIDATION_FAILED
  ],
  [SUMMARY_LOG_STATUS.REJECTED]: [],
  [SUMMARY_LOG_STATUS.VALIDATED]: [SUMMARY_LOG_STATUS.SUBMITTING],
  [SUMMARY_LOG_STATUS.INVALID]: [],
  [SUMMARY_LOG_STATUS.SUBMITTING]: [
    SUMMARY_LOG_STATUS.SUBMITTED,
    SUMMARY_LOG_STATUS.SUPERSEDED, // Stale preview - cannot be resubmitted
    SUMMARY_LOG_STATUS.SUBMISSION_FAILED
  ],
  [SUMMARY_LOG_STATUS.SUBMITTED]: [],
  [SUMMARY_LOG_STATUS.SUPERSEDED]: [], // Keep state for backwards compatibility
  [SUMMARY_LOG_STATUS.VALIDATION_FAILED]: [],
  [SUMMARY_LOG_STATUS.SUBMISSION_FAILED]: []
}

class InvalidTransitionError extends Error {
  constructor(fromStatus, toStatus) {
    super(`Cannot transition summary log from ${fromStatus} to ${toStatus}`)
    this.name = 'InvalidTransitionError'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

/**
 * @param {string} uploadStatus
 * @returns {string}
 */
export const determineStatusFromUpload = (uploadStatus) => {
  const status = UploadStatusToSummaryLogStatusMap[uploadStatus]
  if (!status) {
    throw new Error(`Invalid upload status: ${uploadStatus}`)
  }
  return status
}

/**
 * Validates a status transition and returns an update object with the new
 * status and calculated expiresAt value.
 * @param {{status?: string}} summaryLog - The current summary log (only status is read)
 * @param {string} newStatus - The status to transition to
 * @returns {{status: string, expiresAt: Date|null}} Update object for repository
 * @throws {InvalidTransitionError} If the transition is not allowed
 */
export const transitionStatus = (summaryLog, newStatus) => {
  const fromStatus = summaryLog?.status

  if (fromStatus) {
    const allowedTransitions = VALID_TRANSITIONS[fromStatus]
    const isValid = allowedTransitions
      ? allowedTransitions.includes(newStatus)
      : false

    if (!isValid) {
      throw new InvalidTransitionError(fromStatus, newStatus)
    }
  }

  return {
    status: newStatus,
    expiresAt: calculateExpiresAt(newStatus)
  }
}

/**
 * Known error messages from CDP Uploader mapped to validation codes
 * @see https://github.com/DEFRA/cdp-uploader/blob/main/src/server/common/constants/file-error-messages.js
 */
const UPLOADER_ERROR_MAPPINGS = [
  {
    message: 'The selected file contains a virus',
    code: VALIDATION_CODE.FILE_VIRUS_DETECTED
  },
  { message: 'The selected file is empty', code: VALIDATION_CODE.FILE_EMPTY },
  {
    message: 'The selected file must be smaller than',
    code: VALIDATION_CODE.FILE_TOO_LARGE,
    startsWith: true
  },
  {
    message: 'The selected file must be a',
    code: VALIDATION_CODE.FILE_WRONG_TYPE,
    startsWith: true
  },
  {
    message: 'The selected file could not be uploaded',
    code: VALIDATION_CODE.FILE_UPLOAD_FAILED,
    startsWith: true
  },
  {
    message: 'The selected file could not be downloaded',
    code: VALIDATION_CODE.FILE_DOWNLOAD_FAILED
  }
]

/**
 * Maps a CDP Uploader error message to a validation code
 * @param {string} [errorMessage] - Error message from CDP Uploader
 * @returns {string} Validation code for i18n lookup
 */
export const mapUploaderErrorToCode = (errorMessage) => {
  if (!errorMessage) {
    return VALIDATION_CODE.FILE_REJECTED
  }

  for (const mapping of UPLOADER_ERROR_MAPPINGS) {
    const isMatch = mapping.startsWith
      ? errorMessage.startsWith(mapping.message)
      : errorMessage === mapping.message

    if (isMatch) {
      return mapping.code
    }
  }

  return VALIDATION_CODE.FILE_REJECTED
}

/**
 * Creates a validation object for rejected uploads
 * @param {string} [errorMessage] - Error message from CDP Uploader
 * @returns {object} Validation object with failures array
 */
export const createRejectedValidation = (errorMessage) => {
  const code = mapUploaderErrorToCode(errorMessage)
  return {
    failures: [{ code }]
  }
}

/**
 * @returns {string}
 */
export const getDefaultStatus = () => SUMMARY_LOG_STATUS.PREPROCESSING
