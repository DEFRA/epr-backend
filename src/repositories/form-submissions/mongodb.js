const ACCREDITATIONS_COLLECTION = 'accreditation'
const REGISTRATIONS_COLLECTION = 'registration'

const mapDocument = (doc) => {
  const { _id, orgId, referenceNumber, rawSubmissionData } = doc
  return {
    id: _id.toString(),
    orgId,
    referenceNumber,
    rawSubmissionData
  }
}

const performFindAllAccreditations = (db) => async () => {
  const docs = await db.collection(ACCREDITATIONS_COLLECTION).find().toArray()
  return docs.map(mapDocument)
}

const performFindAllRegistrations = (db) => async () => {
  const docs = await db.collection(REGISTRATIONS_COLLECTION).find().toArray()
  return docs.map(mapDocument)
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (db) => () => {
  return {
    findAllAccreditations: performFindAllAccreditations(db),
    findAllRegistrations: performFindAllRegistrations(db)
  }
}
