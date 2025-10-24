const COLLECTION_NAME = 'organisation'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (db) => () => ({
  async findAll() {
    const docs = await db
      .collection(COLLECTION_NAME)
      .find({}, { projection: { _id: 1, orgId: 1, rawSubmissionData: 1 } })
      .toArray()

    return docs.map((doc) => ({
      id: doc._id.toString(),
      orgId: doc.orgId,
      rawSubmissionData: doc.rawSubmissionData
    }))
  }
})
