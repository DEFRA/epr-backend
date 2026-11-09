import { EXTERNAL_ACCREDITATIONS_COLLECTION_NAME } from '#organisation-read-model/repository/mongodb.js'
import {
  normaliseRegistrationNumber,
  validateExternalAccreditation
} from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { ExternalAccreditationsRepositoryFactory } from './port.js' */

const withoutId = { projection: { _id: 0 } }

/**
 * @param {Db} db
 * @returns {Promise<Collection<ExternalAccreditation>>}
 */
const ensureCollection = async (db) => {
  /** @type {Collection<ExternalAccreditation>} */
  const collection = db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)

  await collection.createIndex(
    { registrationNumber: 1, year: 1 },
    { name: 'registration_year', unique: true }
  )

  return collection
}

/**
 * @param {Db} db
 * @returns {Promise<ExternalAccreditationsRepositoryFactory>}
 */
export const createMongoExternalAccreditationsRepository = async (db) => {
  const collection = await ensureCollection(db)

  return () => ({
    upsert: async (accreditation) => {
      const validated = validateExternalAccreditation(accreditation)
      const { registrationNumber, year } = validated
      await collection.replaceOne(
        { registrationNumber, year },
        { ...validated },
        { upsert: true }
      )
      return validated
    },

    remove: (registrationNumber, year) =>
      collection.findOneAndDelete(
        {
          registrationNumber: normaliseRegistrationNumber(registrationNumber),
          year
        },
        withoutId
      )
  })
}
