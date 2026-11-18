import { EXTERNAL_ACCREDITATIONS_COLLECTION_NAME } from './mongodb.js'

/** @import { Db, Document, Filter } from 'mongodb' */
/** @import { ExternalAccreditation } from '../port.js' */

/**
 * Stores the accreditation in the stand-in as given, without validating it,
 * along with any fields the stand-in no longer reads.
 *
 * @param {Db} db
 * @param {ExternalAccreditation & Record<string, unknown>} accreditation
 */
export const storeStandInAccreditation = async (db, accreditation) => {
  await db
    .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
    .insertOne({ ...accreditation })
}

/**
 * @param {Db} db
 */
export const clearStandInAccreditations = async (db) => {
  await db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME).deleteMany({})
}

/**
 * @param {Db} db
 * @param {Filter<Document>} [filter]
 */
export const countStandInAccreditations = (db, filter = {}) =>
  db.collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME).countDocuments(filter)
