import { SUMMARY_LOG_STATUS } from './status.js'

export const TTL_DURATIONS = Object.freeze({
  TWENTY_MINUTES: 20 * 60 * 1000,
  TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000
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
