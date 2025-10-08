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
  REJECTED: 'rejected'
})

export const determineSummaryLogStatus = (uploadStatus) => {
  return uploadStatus === UPLOAD_STATUS.REJECTED
    ? SUMMARY_LOG_STATUS.REJECTED
    : SUMMARY_LOG_STATUS.VALIDATING
}
