export const REPORT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  READY_TO_SUBMIT: 'ready_to_submit',
  SUBMITTED: 'submitted',
  SUPERSEDED: 'superseded',
  DELETED: 'deleted'
})

/**
 * @typedef {typeof REPORT_STATUS[keyof typeof REPORT_STATUS]} ReportStatus
 */
