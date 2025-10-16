const COLLECTION_NAME = 'epr-organisations'

/**
 * @returns {import('./port.js').OrganisationsRepository}
 */
export const createOrganisationsRepository = (db) => ({
  async findAll() {
    return db.collection(COLLECTION_NAME).find().toArray()
  }
})
