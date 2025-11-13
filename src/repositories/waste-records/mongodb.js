import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'

/**
 * Create a MongoDB waste records repository
 *
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').WasteRecordsRepositoryFactory}
 */
export const createWasteRecordsRepository = (db) => {
  return () => ({
    async findByRegistration(organisationId, registrationId) {
      const validatedOrgId = validateOrganisationId(organisationId)
      const validatedRegId = validateRegistrationId(registrationId)

      const collection = db.collection('waste-records')

      const records = await collection
        .find({
          organisationId: validatedOrgId,
          registrationId: validatedRegId
        })
        .toArray()

      return records.map((record) => ({
        ...record,
        _id: undefined
      }))
    },

    async upsertWasteRecords(wasteRecords) {
      const collection = db.collection('waste-records')

      for (const record of wasteRecords) {
        const validatedRecord = validateWasteRecord(record)

        const { organisationId, registrationId, type, rowId, ...updateData } =
          validatedRecord

        await collection.updateOne(
          {
            organisationId,
            registrationId,
            type,
            rowId
          },
          {
            $set: updateData
          },
          {
            upsert: true
          }
        )
      }
    }
  })
}
