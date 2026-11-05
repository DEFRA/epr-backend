import { validateFutureAccreditation } from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { FutureAccreditation, FutureAccreditationsRepositoryFactory } from './port.js' */

export const FUTURE_ACCREDITATIONS_COLLECTION_NAME = 'stub-accreditations'

const withoutId = { projection: { _id: 0 } }

/**
 * @param {Db} db
 * @returns {Promise<Collection<FutureAccreditation>>}
 */
const ensureCollection = async (db) => {
  /** @type {Collection<FutureAccreditation>} */
  const collection = db.collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)

  await collection.createIndex(
    { registrationNumber: 1, year: 1 },
    { name: 'registration_year', unique: true }
  )

  return collection
}

/**
 * @param {Db} db
 * @returns {Promise<FutureAccreditationsRepositoryFactory>}
 */
export const createMongoFutureAccreditationsRepository = async (db) => {
  const collection = await ensureCollection(db)

  return () => ({
    findByRegistrationNumbers: (registrationNumbers) =>
      collection
        .find({ registrationNumber: { $in: registrationNumbers } }, withoutId)
        .sort({ registrationNumber: 1, year: 1 })
        .toArray(),

    upsert: async (accreditation) => {
      const validated = validateFutureAccreditation(accreditation)
      const { registrationNumber, year } = validated
      await collection.replaceOne(
        { registrationNumber, year },
        { ...validated },
        { upsert: true }
      )
      return validated
    },

    remove: (registrationNumber, year) =>
      collection.findOneAndDelete({ registrationNumber, year }, withoutId)
  })
}
