import { config } from '#root/config.js'
import { currentUtcYear, nextYear } from './year.js'

/** @import { Year } from './year.js' */

/**
 * The latest year the service serves: the current UTC year, or the year after
 * it where the environment opens it early.
 * @param {Date} [now]
 * @returns {Year}
 */
export function latestOpenYear(now = new Date()) {
  const current = currentUtcYear(now)
  return config.get('latestOpenYear') === 'next' ? nextYear(current) : current
}
