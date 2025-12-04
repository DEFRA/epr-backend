import { VALIDATION_CODE } from '#common/enums/validation.js'

export const SUMMARY_LOG_STATUS = Object.freeze({
  PREPROCESSING: 'preprocessing',
  REJECTED: 'rejected',
  VALIDATING: 'validating',
  INVALID: 'invalid',
  VALIDATED: 'validated',
  SUBMITTING: 'submitting',
  SUBMITTED: 'submitted'
})

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
    SUMMARY_LOG_STATUS.VALIDATING
  ],
  [SUMMARY_LOG_STATUS.VALIDATING]: [
    SUMMARY_LOG_STATUS.VALIDATED,
    SUMMARY_LOG_STATUS.INVALID
  ],
  [SUMMARY_LOG_STATUS.REJECTED]: [],
  [SUMMARY_LOG_STATUS.VALIDATED]: [SUMMARY_LOG_STATUS.SUBMITTING],
  [SUMMARY_LOG_STATUS.INVALID]: [],
  [SUMMARY_LOG_STATUS.SUBMITTING]: [SUMMARY_LOG_STATUS.SUBMITTED],
  [SUMMARY_LOG_STATUS.SUBMITTED]: []
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
 * @template {{status?: string}} T
 * @param {T} summaryLog
 * @param {string} newStatus
 * @returns {T & {status: string}}
 * @throws {InvalidTransitionError}
 */
export const transitionStatus = (summaryLog, newStatus) => {
  const fromStatus = summaryLog?.status

  if (!fromStatus) {
    return { ...summaryLog, status: newStatus }
  }

  const allowedTransitions = VALID_TRANSITIONS[fromStatus]
  const isValid = allowedTransitions
    ? allowedTransitions.includes(newStatus)
    : false

  if (!isValid) {
    throw new InvalidTransitionError(fromStatus, newStatus)
  }

  return { ...summaryLog, status: newStatus }
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
