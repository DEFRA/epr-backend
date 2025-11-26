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
 * @param {string} status
 * @param {string} [errorMessage]
 * @returns {string | undefined}
 */
export const determineFailureReason = (status, errorMessage) => {
  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    return (
      errorMessage ||
      'Something went wrong with your file upload. Please try again.'
    )
  }
  return undefined
}

/**
 * @returns {string}
 */
export const getDefaultStatus = () => SUMMARY_LOG_STATUS.PREPROCESSING
