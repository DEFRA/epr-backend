/**
 * Builds a Map from accreditationId to registrationId using
 * the registrations array (where each registration may have
 * an `accreditationId` linking to its accreditation).
 *
 * @param {Array<{ id: string, accreditationId?: string }>} registrations
 * @returns {Map<string, string>}
 */
const buildAccreditationToRegistrationMap = (registrations) => {
  const map = new Map()
  for (const registration of registrations) {
    if (registration.accreditationId) {
      map.set(registration.accreditationId, registration.id)
    }
  }
  return map
}

/**
 * Compares two organisation snapshots and returns accreditations
 * whose status has changed between them.
 *
 * Both `initial` and `updated` are expected to have
 * `.accreditations[].status` already computed (e.g. via
 * `mapDocumentWithCurrentStatuses`).
 *
 * @param {object} initial - Organisation snapshot before the update
 * @param {object} updated - Organisation snapshot after the update
 * @returns {Array<{ accreditationId: string, registrationId: string, previousStatus: string, newStatus: string }>}
 */
export const detectAccreditationStatusChanges = (initial, updated) => {
  if (!updated?.accreditations?.length) {
    return []
  }

  const initialById = new Map(
    (initial?.accreditations ?? []).map((a) => [a.id, a])
  )

  const accToReg = buildAccreditationToRegistrationMap(
    updated?.registrations ?? []
  )

  const changes = []

  for (const accreditation of updated.accreditations) {
    const previous = initialById.get(accreditation.id)
    const previousStatus = previous?.status
    const newStatus = accreditation.status

    if (previousStatus && newStatus && previousStatus !== newStatus) {
      const registrationId = accToReg.get(accreditation.id)

      if (registrationId) {
        changes.push({
          accreditationId: accreditation.id,
          registrationId,
          previousStatus,
          newStatus
        })
      }
    }
  }

  return changes
}
