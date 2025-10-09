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

export const determineStatusFromUpload = (uploadStatus) => {
  const status = UploadStatusToSummaryLogStatusMap[uploadStatus]
  if (!status) {
    throw new Error(`Invalid upload status: ${uploadStatus}`)
  }
  return status
}

export const determineFailureReason = (status) => {
  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    return 'File rejected by virus scan'
  }
  return undefined
}

export const getDefaultStatus = () => SUMMARY_LOG_STATUS.PREPROCESSING
