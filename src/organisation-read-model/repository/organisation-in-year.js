import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/**
 * The entry of `byYear` for `year`, or none when it has none for it.
 * @template {Partial<Record<Year, unknown>>} R
 * @param {R} byYear
 * @param {Year} year
 * @returns {R}
 */
const onlyYear = (byYear, year) =>
  /** @type {R} */ (Object.hasOwn(byYear, year) ? { [year]: byYear[year] } : {})

/**
 * The organisation in `year`: registrations approved at any point in it, each
 * with only that year's accreditation and standing. Statuses are the latest.
 *
 * @param {Organisation} organisation
 * @param {Year} year
 * @returns {Organisation}
 */
export const organisationInYear = (organisation, year) => {
  const registrations = Object.entries(organisation.registrations)
    .filter(([, registration]) =>
      approvedYears(registration.status.timeline, year).includes(year)
    )
    .map(([number, registration]) => [
      number,
      {
        ...registration,
        accreditations: onlyYear(registration.accreditations, year),
        standingByDate: onlyYear(registration.standingByDate, year)
      }
    ])

  return { ...organisation, registrations: Object.fromEntries(registrations) }
}
