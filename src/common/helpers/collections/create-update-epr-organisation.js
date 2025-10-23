const collectionName = 'epr-organisations'

/**
 * Create or update the EPR Organisation collection
 *
 * Note: this collection is created without any schema validation
 * as we validate inserted data at the repository level
 *
 * @param db
 * @param collections
 * @returns {Promise<void>}
 */
export async function createOrUpdateEPROrganisationCollection(db, collections) {
  if (!collections.find(({ name }) => name === collectionName)) {
    await db.createCollection(collectionName)
  } else {
    await db.command({ collMod: collectionName })
  }
}
