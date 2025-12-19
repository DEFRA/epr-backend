import { SUMMARY_LOG_STATUS } from './status.js'

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY

const TTL_MINUTES = 20
const TTL_HOURS = 24
const TTL_DAYS = 7

export const TTL_DURATIONS = Object.freeze({
  TWENTY_MINUTES: TTL_MINUTES * MILLISECONDS_PER_MINUTE,
  TWENTY_FOUR_HOURS: TTL_HOURS * MILLISECONDS_PER_HOUR,
  SEVEN_DAYS: TTL_DAYS * MILLISECONDS_PER_DAY
})

const STATUS_TO_TTL = {
  [SUMMARY_LOG_STATUS.PREPROCESSING]: TTL_DURATIONS.TWENTY_FOUR_HOURS,
  [SUMMARY_LOG_STATUS.VALIDATING]: TTL_DURATIONS.TWENTY_FOUR_HOURS,
  [SUMMARY_LOG_STATUS.VALIDATED]: TTL_DURATIONS.SEVEN_DAYS,
  [SUMMARY_LOG_STATUS.SUPERSEDED]: TTL_DURATIONS.TWENTY_FOUR_HOURS,
  [SUMMARY_LOG_STATUS.REJECTED]: TTL_DURATIONS.TWENTY_FOUR_HOURS,
  [SUMMARY_LOG_STATUS.INVALID]: TTL_DURATIONS.SEVEN_DAYS,
  [SUMMARY_LOG_STATUS.VALIDATION_FAILED]: TTL_DURATIONS.TWENTY_FOUR_HOURS,
  [SUMMARY_LOG_STATUS.SUBMITTING]: TTL_DURATIONS.TWENTY_MINUTES,
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
