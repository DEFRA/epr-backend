import { ObjectId } from 'mongodb'
import { COLLECTION_PACKAGING_RECYCLING_NOTES } from '../../common/enums/db.js'

/** @import {Db} from 'mongodb'.Db */

/**
 *
 * @param {Db} db
 * @param {String} id
 * @returns {Promise<Object>} Prn
 */
const findById = async (db, id) => {
  return db
    .collection(COLLECTION_PACKAGING_RECYCLING_NOTES)
    .findOne({ _id: ObjectId.createFromHexString(id) })
}

/**
 * @param {Db} db
 * @return {import('./port.js').PackagingRecyclingNotesRepositoryFactory}
 */
export const createPackagingRecyclingNotesRepository = (db) => () => {
  return {
    findById: (id) => findById(db, id)
  }
}
