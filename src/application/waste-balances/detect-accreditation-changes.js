import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/** @import {Organisation} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *   accreditationId: string
 *   previousStatus: string
 *   currentStatus: string
 * }} AccreditationStatusChange
 */

/**
 * Compares initial and updated organisation snapshots to find accreditations
 * whose status changed in a way that could affect waste balances.
 *
 * Only returns changes where either the old or new status is 'approved',
 * since other transitions do not affect waste balances.
 *
 * Both objects must have `.accreditations[].status` already set
 * (e.g. via `mapDocumentWithCurrentStatuses`).
 *
 * @param {Organisation} initial - Organisation snapshot before the update
 * @param {Organisation} updated - Organisation snapshot after the update
 * @returns {AccreditationStatusChange[]}
 */
export const detectAccreditationStatusChanges = (initial, updated) => {
  const initialById = new Map(
    (initial.accreditations ?? []).map((a) => [a.id, a.status])
  )

  /** @type {AccreditationStatusChange[]} */
  const changes = []

  for (const accreditation of updated.accreditations ?? []) {
    const previousStatus = initialById.get(accreditation.id)
    const currentStatus = accreditation.status

    if (previousStatus === currentStatus) {
      continue
    }

    const involvesApproved =
      previousStatus === REG_ACC_STATUS.APPROVED ||
      currentStatus === REG_ACC_STATUS.APPROVED

    if (!involvesApproved) {
      continue
    }

    changes.push({
      accreditationId: accreditation.id,
      previousStatus,
      currentStatus
    })
  }

  return changes
}
