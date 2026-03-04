/**
 * Compares accreditation statuses between two organisation snapshots and
 * returns the IDs of accreditations whose status changed.
 *
 * @param {Object} initial - Organisation state before update
 * @param {Object} updated - Organisation state after update
 * @returns {string[]} Accreditation IDs with changed status
 */
export const detectAccreditationStatusChanges = (initial, updated) => {
  const initialStatusById = new Map(
    (initial.accreditations ?? []).map((acc) => [acc.id, acc.status])
  )

  return (updated.accreditations ?? [])
    .filter((acc) => {
      const previousStatus = initialStatusById.get(acc.id)
      return previousStatus !== undefined && previousStatus !== acc.status
    })
    .map((acc) => acc.id)
}
