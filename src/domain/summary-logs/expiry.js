import { SUMMARY_LOG_STATUS } from './status.js'

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7

const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY
const MILLISECONDS_PER_WEEK = MILLISECONDS_PER_DAY * DAYS_PER_WEEK

const STATUS_TO_TTL = {
  [SUMMARY_LOG_STATUS.PREPROCESSING]: MILLISECONDS_PER_DAY,
  [SUMMARY_LOG_STATUS.VALIDATING]: MILLISECONDS_PER_DAY,
  [SUMMARY_LOG_STATUS.VALIDATED]: MILLISECONDS_PER_WEEK,
  [SUMMARY_LOG_STATUS.SUPERSEDED]: MILLISECONDS_PER_DAY,
  [SUMMARY_LOG_STATUS.REJECTED]: MILLISECONDS_PER_DAY,
  [SUMMARY_LOG_STATUS.INVALID]: MILLISECONDS_PER_WEEK,
  [SUMMARY_LOG_STATUS.VALIDATION_FAILED]: MILLISECONDS_PER_DAY,
  [SUMMARY_LOG_STATUS.SUBMITTING]: 20 * MILLISECONDS_PER_MINUTE,
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
