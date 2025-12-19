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

const minutes = (n) => n * MILLISECONDS_PER_MINUTE
const days = (n) => n * MILLISECONDS_PER_DAY
const weeks = (n) => n * MILLISECONDS_PER_WEEK

const STATUS_TO_TTL = {
  [SUMMARY_LOG_STATUS.PREPROCESSING]: days(1),
  [SUMMARY_LOG_STATUS.VALIDATING]: days(1),
  [SUMMARY_LOG_STATUS.VALIDATED]: weeks(1),
  [SUMMARY_LOG_STATUS.SUPERSEDED]: days(1),
  [SUMMARY_LOG_STATUS.REJECTED]: days(1),
  [SUMMARY_LOG_STATUS.INVALID]: weeks(1),
  [SUMMARY_LOG_STATUS.VALIDATION_FAILED]: days(1),
  [SUMMARY_LOG_STATUS.SUBMITTING]: minutes(20),
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
