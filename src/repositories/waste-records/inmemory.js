import { validateOrganisationId, validateRegistrationId } from './validation.js'

/**
 * Finds the index of a record matching the composite key
 * @param {Array} storage - Storage array
 * @param {import('./schema.js').WasteRecordKey} key - Composite key identifying the record
 * @returns {number} Index of matching record, or -1 if not found
 */
const findRecordIndex = (
  storage,
  { organisationId, registrationId, type, rowId }
) => {
  return storage.findIndex(
    (r) =>
      r.organisationId === organisationId &&
      r.registrationId === registrationId &&
      r.type === type &&
      r.rowId === rowId
  )
}

/**
 * Appends a version to an existing record or creates a new record
 * @param {Array} storage - Storage array
 * @param {import('./schema.js').WasteRecordKey} key - Composite key identifying the record
 * @param {string | undefined} accreditationId
 * @param {Object} versionData
 */
const appendVersionToRecord = (storage, key, accreditationId, versionData) => {
  const existingIndex = findRecordIndex(storage, key)

  if (existingIndex >= 0) {
    const existing = storage[existingIndex]

    // Check if this version already exists (idempotency check)
    const versionExists = existing.versions.some(
      (v) => v.summaryLog.id === versionData.version.summaryLog.id
    )

    if (!versionExists) {
      // Append new version and update data
      existing.versions.push(structuredClone(versionData.version))
      existing.data = structuredClone(versionData.data)
      existing.accreditationId = accreditationId
    }
    // If version exists, preserve existing data (idempotent - no changes)
  } else {
    // Create new record with first version
    storage.push({
      ...key,
      accreditationId,
      data: structuredClone(versionData.data),
      versions: [structuredClone(versionData.version)]
    })
  }
}

/**
 * Create an in-memory waste records repository.
 * Ensures data isolation by deep-cloning on store and on read.
 *
 * @param {Array} [initialRecords=[]]
 * @returns {import('./port.js').WasteRecordsRepositoryFactory}
 */
export const createInMemoryWasteRecordsRepository = (initialRecords = []) => {
  const storage = structuredClone(initialRecords)

  return () => ({
    async findByRegistration(organisationId, registrationId) {
      const validatedOrgId = validateOrganisationId(organisationId)
      const validatedRegId = validateRegistrationId(registrationId)

      return structuredClone(
        storage.filter(
          (record) =>
            record.organisationId === validatedOrgId &&
            record.registrationId === validatedRegId
        )
      )
    },

    async appendVersions(
      organisationId,
      registrationId,
      accreditationId,
      wasteRecordVersions
    ) {
      const validatedOrgId = validateOrganisationId(organisationId)
      const validatedRegId = validateRegistrationId(registrationId)

      for (const [type, versionsByRowId] of wasteRecordVersions) {
        for (const [rowId, versionData] of versionsByRowId) {
          appendVersionToRecord(
            storage,
            {
              organisationId: validatedOrgId,
              registrationId: validatedRegId,
              type,
              rowId
            },
            accreditationId,
            versionData
          )
        }
      }
    }
  })
}
