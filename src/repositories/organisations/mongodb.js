const COLLECTION_NAME = 'epr-organisations'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createOrganisationsRepository = (db) => () => ({
  async findAll() {
    return db.collection(COLLECTION_NAME).find().toArray()
  }
})
