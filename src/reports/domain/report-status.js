export const REPORT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  READY_TO_SUBMIT: 'ready_to_submit',
  SUBMITTED: 'submitted'
})

export const REPORT_STATUS_SLOT = Object.freeze({
  CREATED: 'created',
  READY: 'ready',
  SUBMITTED: 'submitted',
  UNSUBMITTED: 'unsubmitted'
})

/** @type {Record<string, string>} */
export const STATUS_TO_SLOT = {
  [REPORT_STATUS.IN_PROGRESS]: REPORT_STATUS_SLOT.CREATED,
  [REPORT_STATUS.READY_TO_SUBMIT]: REPORT_STATUS_SLOT.READY,
  [REPORT_STATUS.SUBMITTED]: REPORT_STATUS_SLOT.SUBMITTED
}

/**
 * @typedef {typeof REPORT_STATUS[keyof typeof REPORT_STATUS]} ReportStatus
 */
