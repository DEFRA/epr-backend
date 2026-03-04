/**
 * Detects accreditation status changes between two organisation snapshots.
 *
 * Compares accreditations present in both the initial and updated organisation,
 * returning the IDs of any whose status has changed. Newly added accreditations
 * (present only in `updated`) are ignored.
 *
 * @param {object} initial - The organisation before the update
 * @param {object} updated - The organisation after the update
 * @returns {string[]} IDs of accreditations whose status changed
 */
export const detectAccreditationStatusChanges = (initial, updated) => {
  const initialAccreditations = initial.accreditations ?? []
  const updatedAccreditations = updated.accreditations ?? []

  const initialStatusById = new Map(
    initialAccreditations.map((a) => [a.id, a.status])
  )

  const changedIds = []

  for (const acc of updatedAccreditations) {
    const previousStatus = initialStatusById.get(acc.id)

    if (previousStatus !== undefined && previousStatus !== acc.status) {
      changedIds.push(acc.id)
    }
  }

  return changedIds
}
