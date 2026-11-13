/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { StatusTimeline } from '#organisation-read-model/domain/model.js' */

/**
 * Until ADR-0051's events exist, the first approval after the last `created`
 * takes effect from validFrom, and a later approval, suspension or
 * cancellation no earlier than that; every other change takes effect when it
 * was recorded. Each change overrides whatever was recorded before it from its
 * own `at` onward, so the timeline holds only the changes that take effect, in
 * order.
 *
 * @param {StatusHistoryEntryOf<string>[]} statusHistory
 * @param {string} [validFrom]
 * @returns {StatusTimeline}
 */
export function toStatusTimeline(statusHistory, validFrom) {
  const recorded = statusHistory
    .map(({ status, updatedAt }) => ({
      status,
      at: new Date(updatedAt),
      updatedAt: new Date(updatedAt)
    }))
    // A stable sort keeps recorded order among equal times
    .toSorted(
      (one, other) => one.updatedAt.getTime() - other.updatedAt.getTime()
    )
  if (validFrom) {
    datesFromValidFrom(recorded, new Date(validFrom))
  }
  return recorded
    .reduce(
      (timeline, change) => [
        ...timeline.filter(({ at }) => at <= change.at),
        change
      ],
      /** @type {typeof recorded} */ ([])
    )
    .map(({ status, at, updatedAt }) => ({
      status,
      at: at.toISOString(),
      updatedAt: updatedAt.toISOString()
    }))
}

const FROM_VALID_FROM = new Set(['approved', 'suspended', 'cancelled'])

/**
 * @param {{ status: string, at: Date }[]} recorded - in recorded order
 * @param {Date} validFrom
 */
function datesFromValidFrom(recorded, validFrom) {
  const lastCreated = recorded.findLastIndex(
    ({ status }) => status === 'created'
  )
  const approval = recorded.findIndex(
    ({ status }, index) => index > lastCreated && status === 'approved'
  )
  if (approval < 0) {
    return
  }
  recorded[approval].at = validFrom
  for (const change of recorded.slice(approval + 1)) {
    if (FROM_VALID_FROM.has(change.status) && change.at < validFrom) {
      change.at = validFrom
    }
  }
}
