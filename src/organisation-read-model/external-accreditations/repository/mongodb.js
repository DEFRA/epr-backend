import { dropIndexIfPresent } from '#common/helpers/drop-index-if-present.js'
import { EXTERNAL_ACCREDITATIONS_COLLECTION_NAME } from '../external-accreditation-sources.js'
import { validateExternalAccreditation } from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { ExternalAccreditationsRepositoryFactory } from './port.js' */

/** Unique on registration and year alone, before accreditations carried the organisation. */
const RETIRED_IDENTITY_INDEX_NAME = 'registration_year'

/**
 * @param {Db} db
 * @returns {Promise<Collection<ExternalAccreditation>>}
 */
const ensureCollection = async (db) => {
  /** @type {Collection<ExternalAccreditation>} */
  const collection = db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)

  // Led by the organisation number, so it also serves the reads and the
  // non-prod reset, which find accreditations by organisation alone.
  await collection.createIndex(
    { organisationNumber: 1, registrationNumber: 1, year: 1 },
    { name: 'organisation_registration_year', unique: true }
  )

  await dropIndexIfPresent(collection, RETIRED_IDENTITY_INDEX_NAME)

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
      const { organisationNumber, registrationNumber, year } = validated
      await collection.replaceOne(
        { organisationNumber, registrationNumber, year },
        { ...validated },
        { upsert: true }
      )
      return validated
    }
  })
}
