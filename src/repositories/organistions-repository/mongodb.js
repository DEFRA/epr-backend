const COLLECTION_NAME = 'organisations'

/**
 * @returns {import('./port.js').OrganisationsRepository}
 */
export const createOrganisationsRepository = (db) => ({
  async findAll() {
    return db.collection(COLLECTION_NAME).find().toArray();
  },
})
