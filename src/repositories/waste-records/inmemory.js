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
    async findAll(organisationId, registrationId) {
      return structuredClone(
        storage.filter(
          (record) =>
            record.organisationId === organisationId &&
            record.registrationId === registrationId
        )
      )
    },

    async saveAll(wasteRecords) {
      for (const record of wasteRecords) {
        // Find existing record with same key
        const existingIndex = storage.findIndex(
          (r) =>
            r.organisationId === record.organisationId &&
            r.registrationId === record.registrationId &&
            r.type === record.type &&
            r.rowId === record.rowId
        )

        if (existingIndex >= 0) {
          // Update existing record
          storage[existingIndex] = structuredClone(record)
        } else {
          // Insert new record
          storage.push(structuredClone(record))
        }
      }
    }
  })
}
