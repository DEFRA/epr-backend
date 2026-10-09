import { approvedYears } from './status-timeline.js'

/** @import { Organisation } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the current year.
 *
 * @param {Organisation} organisation
 * @param {Date} [now]
 * @returns {number[]}
 */
export const organisationYears = (organisation, now = new Date()) => {
  const today = now.toISOString().slice(0, 10)
  const years = Object.values(organisation.registrations).flatMap(
    ({ statusTimeline }) => approvedYears(statusTimeline, today)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}
