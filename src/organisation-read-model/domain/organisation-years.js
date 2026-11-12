import { approvedYears } from './status-timeline.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation } from './model.js' */

/**
 * The calendar years in which the organisation held an approved registration,
 * newest first, up to and including the year of `endDate`.
 *
 * @param {Organisation} organisation
 * @param {CalendarDate} endDate
 * @returns {Year[]}
 */
export const organisationYears = (organisation, endDate) => {
  const years = Object.values(organisation.registrations).flatMap(
    ({ status }) => approvedYears(status.timeline, endDate)
  )
  return [...new Set(years)].sort((a, b) => b - a)
}
