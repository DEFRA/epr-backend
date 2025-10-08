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

export const determineSummaryLogStatus = (uploadStatus) => {
  switch (uploadStatus) {
    case UPLOAD_STATUS.REJECTED:
      return SUMMARY_LOG_STATUS.REJECTED
    case UPLOAD_STATUS.PENDING:
      return SUMMARY_LOG_STATUS.PREPROCESSING
    case UPLOAD_STATUS.COMPLETE:
      return SUMMARY_LOG_STATUS.VALIDATING
    default:
      throw new Error(`Invalid upload status: ${uploadStatus}`)
  }
}
