export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    return db.collection('summary-logs').insertOne(summaryLog)
  },

  async findByFileId(fileId) {
    return db.collection('summary-logs').findOne({ fileId })
  },

  async findByOrganisationAndRegistration(organisationId, registrationId) {
    return db
      .collection('summary-logs')
      .find({
        organisationId,
        registrationId
      })
      .toArray()
  }
})
