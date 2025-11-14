import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'

/**
 * Finds the index of a record matching the composite key
 * @param {Array} storage - Storage array
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} type
 * @param {string} rowId
 * @returns {number} Index of matching record, or -1 if not found
 */
const findRecordIndex = (
  storage,
  organisationId,
  registrationId,
  type,
  rowId
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

        const existingIndex = findRecordIndex(
          storage,
          validatedRecord.organisationId,
          validatedRecord.registrationId,
          validatedRecord.type,
          validatedRecord.rowId
        )

        if (existingIndex >= 0) {
          // Update existing record
          storage[existingIndex] = structuredClone(validatedRecord)
        } else {
          // Insert new record
          storage.push(structuredClone(validatedRecord))
        }
      }
    },

    async appendVersions(organisationId, registrationId, versionsByKey) {
      const validatedOrgId = validateOrganisationId(organisationId)
      const validatedRegId = validateRegistrationId(registrationId)

      for (const [key, versionData] of versionsByKey) {
        // Parse the key to extract type and rowId
        const [type, rowId] = key.split(':')

        const existingIndex = findRecordIndex(
          storage,
          validatedOrgId,
          validatedRegId,
          type,
          rowId
        )

        if (existingIndex >= 0) {
          const existing = storage[existingIndex]

          // Check if this version already exists (idempotency check)
          const versionExists = existing.versions.some(
            (v) => v.summaryLog.id === versionData.version.summaryLog.id
          )

          if (!versionExists) {
            // Append new version
            existing.versions.push(structuredClone(versionData.version))
          }

          // Always update current data
          existing.data = structuredClone(versionData.data)
        } else {
          // Create new record with first version
          storage.push({
            organisationId: validatedOrgId,
            registrationId: validatedRegId,
            type,
            rowId,
            data: structuredClone(versionData.data),
            versions: [structuredClone(versionData.version)]
          })
        }
      }
    }
  })
}
