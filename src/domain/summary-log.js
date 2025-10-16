export const SUMMARY_LOG_STATUS = Object.freeze({
  PREPROCESSING: 'preprocessing',
  REJECTED: 'rejected',
  VALIDATING: 'validating',
  INVALID: 'invalid',
  VALIDATED: 'validated',
  SUBMITTED: 'submitted'
})

export const UPLOAD_STATUS = Object.freeze({
  COMPLETE: 'complete',
  REJECTED: 'rejected',
  PENDING: 'pending'
})

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
  [SUMMARY_LOG_STATUS.REJECTED]: [],
  [SUMMARY_LOG_STATUS.VALIDATING]: []
}

class InvalidTransitionError extends Error {
  constructor(summaryLogId, fromStatus, toStatus) {
    super(
      `Cannot transition summary log ${summaryLogId} from ${fromStatus} to ${toStatus}`
    )
    this.name = 'InvalidTransitionError'
    this.summaryLogId = summaryLogId
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

export const determineStatusFromUpload = (uploadStatus) => {
  const status = UploadStatusToSummaryLogStatusMap[uploadStatus]
  if (!status) {
    throw new Error(`Invalid upload status: ${uploadStatus}`)
  }
  return status
}

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
    throw new InvalidTransitionError(summaryLog.id, fromStatus, newStatus)
  }

  return { ...summaryLog, status: newStatus }
}

export const determineFailureReason = (status, errorMessage) => {
  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    return (
      errorMessage ||
      'Something went wrong with your file upload. Please try again.'
    )
  }
  return undefined
}

export const getDefaultStatus = () => SUMMARY_LOG_STATUS.PREPROCESSING
