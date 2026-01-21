import { COLLECTION_PACKAGING_RECYCLING_NOTES } from '#common/enums/db.js'

/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

/**
 * @type {CreateOrUpdateCollection}
 */
export async function createOrUpdatePackagingRecyclingNotesCollection(
  db,
  collections
) {
  if (
    !collections.some(
      ({ name }) => name === COLLECTION_PACKAGING_RECYCLING_NOTES
    )
  ) {
    await db.createCollection(COLLECTION_PACKAGING_RECYCLING_NOTES)
  }
}
