/**
 * Finds the date of the history entry matching a PRN's current status.
 * Used by the in-memory adapter for date-range filtering. The MongoDB adapter
 * achieves the same result via $elemMatch in the query.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @returns {Date | null}
 */
export function currentStatusDate(prn) {
  const entry = prn.status.history.findLast(
    (e) => e.status === prn.status.currentStatus
  )
  return entry?.at ?? null
}

/**
 * Checks whether a PRN's current-status history entry falls within the given date range.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {Date} [dateFrom]
 * @param {Date} [dateTo]
 * @returns {boolean}
 */
export function matchesStatusDateRange(prn, dateFrom, dateTo) {
  const date = currentStatusDate(prn)
  if (!date) {
    return false
  }
  const time = date.getTime()
  if (dateFrom && time < dateFrom.getTime()) {
    return false
  }
  if (dateTo && time > dateTo.getTime()) {
    return false
  }
  return true
}
