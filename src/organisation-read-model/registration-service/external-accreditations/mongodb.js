import { dropIndexIfPresent } from '#common/helpers/drop-index-if-present.js'
import { validateExternalAccreditation } from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditation, ExternalAccreditationsLoader, RegistrationService } from '../port.js' */
/** @import { ExternalAccreditationsRepositoryFactory } from './port.js' */

export const EXTERNAL_ACCREDITATIONS_COLLECTION_NAME = 'external-accreditations'

/** Unique on registration and year alone, before accreditations carried the organisation. */
const RETIRED_IDENTITY_INDEX_NAME = 'registration_year'

/**
 * @param {Db} db
 * @returns {Collection<ExternalAccreditation>}
 */
const externalAccreditations = (db) =>
  /** @type {Collection<ExternalAccreditation>} */ (
    db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
  )

/**
 * @param {Db} db
 * @returns {Promise<Collection<ExternalAccreditation>>}
 */
const ensureCollection = async (db) => {
  const collection = externalAccreditations(db)

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

/**
 * Loads external accreditations from the `external-accreditations` collection.
 * Overseas sites an accreditation was stored with before they were lifted from
 * its registration are not read.
 *
 * @param {Db} db
 * @returns {ExternalAccreditationsLoader}
 */
const createMongoExternalAccreditationsLoader =
  (db) => (year, organisationNumber) =>
    externalAccreditations(db)
      .find(
        { year, ...(organisationNumber && { organisationNumber }) },
        { projection: { _id: 0, overseasSites: 0 } }
      )
      .toArray()

/**
 * The `external-accreditations` collection as the registration service,
 * wherever Reg Accred is not called.
 *
 * @param {Db} db
 * @returns {RegistrationService}
 */
export const mongoExternalAccreditationsRegistrationService = (db) => () =>
  createMongoExternalAccreditationsLoader(db)

/**
 * Deletes every external accreditation stored for the organisation, for the non-prod data reset.
 *
 * @param {Db} db
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<number>} how many were deleted
 */
export const deleteExternalAccreditationsOf = async (
  db,
  organisationNumber
) => {
  const { deletedCount } = await externalAccreditations(db).deleteMany({
    organisationNumber
  })
  return deletedCount
}
