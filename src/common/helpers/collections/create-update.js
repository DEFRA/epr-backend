import { createOrUpdateAccreditationCollection } from './create-update-accreditation.js'
import { createOrUpdateOrganisationCollection } from './create-update-organisation.js'
import { createOrUpdateRegistrationCollection } from './create-update-registration.js'

/**
 * @import {Db} from 'mongodb'
 */

/**
 * @async
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function createFormCollections(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  await createOrUpdateOrganisationCollection(db, collections)
  await createOrUpdateRegistrationCollection(db, collections)
  await createOrUpdateAccreditationCollection(db, collections)
}

/**
 * @async
 * @param {Db} db
 * @returns {Promise<void>}
 */
export async function createLockManagerIndex(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })
}
