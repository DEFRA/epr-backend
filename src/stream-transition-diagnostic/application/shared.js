import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

const TRAIL_SEPARATOR = ' -> '

/**
 * @typedef {{ status: string, updatedAt: Date | string }} StatusHistoryEntryLike
 */

/**
 * Sorted (descending) copy of a statusHistory with `updatedAt` normalised to
 * a millisecond timestamp. A local equivalent of
 * `#common/helpers/dates/accreditation.js`'s `getStatusHistoryDateTimes`,
 * needed because that helper's status is narrowed to `AccreditationStatus`
 * and callers here walk registration history too — the sort itself has no
 * status-specific behaviour, so duplicating the two-line body is cheaper than
 * widening a helper typed for its one existing accreditation-only caller.
 *
 * @param {StatusHistoryEntryLike[]} statusHistory
 * @returns {{ status: string, updatedAt: number }[]}
 */
export const sortedStatusHistoryDateTimes = (statusHistory) =>
  statusHistory
    .map((entry) => ({
      status: entry.status,
      updatedAt: new Date(entry.updatedAt).getTime()
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)

/**
 * Renders a `statusHistory` array as an ascending, human-readable trail:
 * `"created@2026-01-12 -> approved@2026-02-01"`. An entry with no resolvable
 * date renders `status@unknown` rather than being dropped, so the transition
 * count in the trail always matches the count used elsewhere.
 *
 * @param {StatusHistoryEntryLike[] | undefined} statusHistory
 * @returns {string}
 */
export const formatStatusHistory = (statusHistory) => {
  if (!statusHistory || statusHistory.length === 0) {
    return 'none'
  }

  const ascending = [...sortedStatusHistoryDateTimes(statusHistory)].reverse()

  return ascending
    .map(({ status, updatedAt }) => {
      const date = Number.isFinite(updatedAt)
        ? toCalendarDate(new Date(updatedAt))
        : 'unknown'
      return `${status}@${date}`
    })
    .join(TRAIL_SEPARATOR)
}

/**
 * How many times, and when, `statusHistory` entered `targetStatus`.
 *
 * @param {StatusHistoryEntryLike[] | undefined} statusHistory
 * @param {string} targetStatus
 * @returns {{ everHeld: boolean, count: number, latestUpdatedAt: number | null }}
 */
export const occurrencesOf = (statusHistory, targetStatus) => {
  const matches = (statusHistory ?? []).filter(
    (entry) => entry.status === targetStatus
  )
  const dated = sortedStatusHistoryDateTimes(matches)
  return {
    everHeld: matches.length > 0,
    count: matches.length,
    latestUpdatedAt: dated[0]?.updatedAt ?? null
  }
}

/**
 * The single accreditation linked to a registration, or null. Iterates
 * rather than indexes `accreditationsForRegistration`'s result: today it
 * holds at most one, but indexing `[0]` would silently pick an arbitrary
 * entry once the multi-year model (ADR 0034) lets it hold several.
 *
 * @param {Registration} registration
 * @param {Organisation} org
 * @returns {Accreditation | null}
 */
export const linkedAccreditation = (registration, org) => {
  const [accreditation] = accreditationsForRegistration(registration, org)
  return accreditation ?? null
}

/**
 * The registration linking to a given accreditation, or null — the reverse
 * of accreditationsForRegistration, needed because the reg/acc status sweep
 * iterates from accreditations (to reach ones no registration links) rather
 * than from registrations.
 *
 * @param {Accreditation} accreditation
 * @param {Organisation} org
 * @returns {Registration | null}
 */
export const linkingRegistration = (accreditation, org) =>
  org.registrations.find((reg) => reg.accreditationId === accreditation.id) ??
  null
