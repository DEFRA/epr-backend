import { approvedYears } from './status-timeline.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including `upToYear`.
 *
 * @param {Organisation} organisation
 * @param {Year} upToYear
 * @returns {Year[]}
 */
export const organisationYears = (organisation, upToYear) => {
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, upToYear)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}
