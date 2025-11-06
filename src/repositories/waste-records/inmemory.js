import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'

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

        // Find existing record with same key
        const existingIndex = storage.findIndex(
          (r) =>
            r.organisationId === validatedRecord.organisationId &&
            r.registrationId === validatedRecord.registrationId &&
            r.type === validatedRecord.type &&
            r.rowId === validatedRecord.rowId
        )

        if (existingIndex >= 0) {
          // Update existing record
          storage[existingIndex] = structuredClone(validatedRecord)
        } else {
          // Insert new record
          storage.push(structuredClone(validatedRecord))
        }
      }
    }
  })
}
