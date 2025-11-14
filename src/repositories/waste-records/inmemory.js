import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'

/**
 * Composite key for uniquely identifying a waste record
 * @typedef {Object} WasteRecordKey
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} type
 * @property {string} rowId
 */

/**
 * Finds the index of a record matching the composite key
 * @param {Array} storage - Storage array
 * @param {WasteRecordKey} key - Composite key identifying the record
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
 * @param {WasteRecordKey} key - Composite key identifying the record
 * @param {Object} versionData
 */
const appendVersionToRecord = (
  storage,
  { organisationId, registrationId, type, rowId },
  versionData
) => {
  const existingIndex = findRecordIndex(storage, {
    organisationId,
    registrationId,
    type,
    rowId
  })

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
    }
    // If version exists, preserve existing data (idempotent - no changes)
  } else {
    // Create new record with first version
    storage.push({
      organisationId,
      registrationId,
      type,
      rowId,
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

    async upsertWasteRecords(wasteRecords) {
      for (const record of wasteRecords) {
        const validatedRecord = validateWasteRecord(record)

        const existingIndex = findRecordIndex(storage, validatedRecord)

        if (existingIndex >= 0) {
          // Update existing record
          storage[existingIndex] = structuredClone(validatedRecord)
        } else {
          // Insert new record
          storage.push(structuredClone(validatedRecord))
        }
      }
    },

    async appendVersions(organisationId, registrationId, versionsByType) {
      const validatedOrgId = validateOrganisationId(organisationId)
      const validatedRegId = validateRegistrationId(registrationId)

      for (const [type, versionsByRowId] of versionsByType) {
        for (const [rowId, versionData] of versionsByRowId) {
          appendVersionToRecord(
            storage,
            {
              organisationId: validatedOrgId,
              registrationId: validatedRegId,
              type,
              rowId
            },
            versionData
          )
        }
      }
    }
  })
}
