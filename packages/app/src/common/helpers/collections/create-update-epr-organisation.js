/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

const collectionName = 'epr-organisations'

/**
 * Create or update the EPR Organisation collection
 *
 * Note: this collection is created without any schema validation
 * as we validate inserted data at the repository level
 *
 * @type {CreateOrUpdateCollection}
 */
export async function createOrUpdateEPROrganisationCollection(db, collections) {
  if (!collections.find(({ name }) => name === collectionName)) {
    await db.createCollection(collectionName)
  }
}
