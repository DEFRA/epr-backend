const ACCREDITATIONS_COLLECTION = 'accreditation'
const REGISTRATIONS_COLLECTION = 'registration'
const COLLECTION_NAME = 'organisation'

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

const performFindAllOrganisations = (db) => async () => {
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

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (db) => () => {
  return {
    findAllAccreditations: performFindAllAccreditations(db),
    findAllRegistrations: performFindAllRegistrations(db),
    findAllOrganisations: performFindAllOrganisations(db)
  }
}
