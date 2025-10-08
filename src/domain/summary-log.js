import { SUMMARY_LOG_STATUS, UPLOAD_STATUS } from '#common/enums/index.js'

export const determineStatusFromUpload = (uploadStatus) => {
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

export const determineFailureReason = (status) => {
  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    return 'File rejected by virus scan'
  }
  return undefined
}

export const getDefaultStatus = () => SUMMARY_LOG_STATUS.PREPROCESSING
