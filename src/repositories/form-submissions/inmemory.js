/**
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = () => () => {
  const storage = new Map()

  return {
    async findAll() {
      return Array.from(storage.values()).map((doc) => ({
        id: doc._id.toString(),
        orgId: doc.orgId,
        rawSubmissionData: doc.rawSubmissionData
      }))
    },

    // Expose storage for testing
    _getStorage: () => storage
  }
}
