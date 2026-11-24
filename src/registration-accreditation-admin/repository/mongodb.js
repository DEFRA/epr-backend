import { COLLECTION_NAME } from '#repositories/organisations/mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

/**
 * @param {Db} db
 * @param {Record<string, unknown>} filter
 */
const isInUse = async (db, filter) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne(filter, { projection: { _id: 1 } })
  return doc !== null
}

/**
 * @param {Db} db
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createRegistrationAccreditationAdminRepository = (db) => () => ({
  isAccreditationNumberInUse: async (accreditationNumber) =>
    isInUse(db, { 'accreditations.accreditationNumber': accreditationNumber }),
  isRegistrationNumberInUse: async (registrationNumber) =>
    isInUse(db, { 'registrations.registrationNumber': registrationNumber })
})
