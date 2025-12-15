/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

import { SYSTEM_LOGS_COLLECTION_NAME } from '#repositories/system-logs/mongodb.js'

/**
 * Create the System log collection
 *
 * @type {CreateOrUpdateCollection}
 */
export async function createSystemLogsCollection(db, collections) {
  if (!collections.some(({ name }) => name === SYSTEM_LOGS_COLLECTION_NAME)) {
    await db.createCollection(SYSTEM_LOGS_COLLECTION_NAME)
  }
}
