/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

const collectionName = 'waste-balances'

/**
 * Create or update the Waste Balances collection
 *
 * Note: this collection is created without any schema validation
 * as we validate inserted data at the repository level
 *
 * @type {CreateOrUpdateCollection}
 */
export async function createOrUpdateWasteBalancesCollection(db, collections) {
  if (!collections.some(({ name }) => name === collectionName)) {
    await db.createCollection(collectionName)
  }
}
