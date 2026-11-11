import { calendarDate } from '#common/helpers/date-formatter.js'
import { utcYearOf, yearBounds } from '#common/helpers/dates/year.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationStatus } from '#domain/organisations/model.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { Registration, StatusTimeline } from '#organisation-read-model/domain/model.js' */

/** @type {ReadonlySet<string>} */
const ACCREDITATION_STATUS_VALUES = new Set(Object.values(ACCREDITATION_STATUS))

/**
 * @param {StatusTimeline[number]} change
 * @returns {change is { status: AccreditationStatus, at: string }}
 */
const isAccreditationChange = (change) =>
  ACCREDITATION_STATUS_VALUES.has(change.status)

/**
 * The years a registration holds an accreditation for.
 *
 * @param {Pick<Registration, 'accreditations'>} registration
 * @returns {Year[]}
 */
export const accreditationYears = ({ accreditations }) =>
  Object.keys(accreditations).map((year) => utcYearOf(year))

/**
 * The validity window and status history that classification and the monthly
 * walk read, taken from the read model's accreditation for its year. ADR-0044
 * has an accreditation valid from its approval to the end of its scheme year.
 *
 * @param {{ registration: Pick<Registration, 'accreditations'>, year: Year }} accreditationOfYear
 * @returns {AccreditationValidity}
 */
export const validityOf = ({ registration, year }) => {
  const { start, end } = yearBounds(year)
  const timeline = registration.accreditations[year].status.timeline.filter(
    isAccreditationChange
  )
  const lastCreated = timeline.findLastIndex(
    ({ status }) => status === ACCREDITATION_STATUS.CREATED
  )
  const approvedAt = timeline.find(
    ({ status }, index) =>
      index > lastCreated && status === ACCREDITATION_STATUS.APPROVED
  )?.at
  return {
    // Latest first, so a change sharing its time with the approval sorts ahead of it
    statusHistory: timeline.toReversed().map(({ status, at }) => ({
      status,
      updatedAt: at
    })),
    ...(approvedAt && {
      validFrom:
        calendarDate(approvedAt).localeCompare(start) < 0
          ? start
          : calendarDate(approvedAt),
      validTo: end
    })
  }
}
