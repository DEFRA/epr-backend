/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { StatusTimeline } from '#organisation-read-model/domain/model.js' */

/**
 * Until ADR-0051's events exist, the first approval after the last `created`
 * takes effect from validFrom, a later one no earlier than that, and every
 * other change when it was recorded. Each change overrides whatever was
 * recorded before it from its own `at` onward, so the timeline holds only
 * the changes that take effect, in order.
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
    datesApprovalsFrom(recorded, new Date(validFrom))
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

/**
 * @param {{ status: string, at: Date }[]} recorded - in recorded order
 * @param {Date} validFrom
 */
function datesApprovalsFrom(recorded, validFrom) {
  const lastCreated = recorded.findLastIndex(
    ({ status }) => status === 'created'
  )
  const approvals = recorded.filter(
    ({ status }, index) => index > lastCreated && status === 'approved'
  )
  approvals.forEach((approval, index) => {
    approval.at =
      index === 0 || approval.at < validFrom ? validFrom : approval.at
  })
}
