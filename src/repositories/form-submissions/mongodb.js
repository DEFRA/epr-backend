import { ObjectId } from 'mongodb'

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

const performFindAccreditationsBySystemReference = (db) => async (ref) => {
  const docs = await db
    .collection(ACCREDITATIONS_COLLECTION)
    .find({ referenceNumber: ref })
    .toArray()
  return docs.map(mapDocument)
}

const performFindAccreditationById = (db) => async (id) => {
  if (!ObjectId.isValid(id)) {
    // gracefully handle when called with malformed id
    return null
  }

  const doc = await db
    .collection(ACCREDITATIONS_COLLECTION)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  return doc ? mapDocument(doc) : null
}

const performFindAllRegistrations = (db) => async () => {
  const docs = await db.collection(REGISTRATIONS_COLLECTION).find().toArray()
  return docs.map(mapDocument)
}

const performFindRegistrationsBySystemReference = (db) => async (ref) => {
  const docs = await db
    .collection(REGISTRATIONS_COLLECTION)
    .find({ referenceNumber: ref })
    .toArray()
  return docs.map(mapDocument)
}

const performFindRegistrationById = (db) => async (id) => {
  if (!ObjectId.isValid(id)) {
    // gracefully handle when called with malformed id
    return null
  }

  const doc = await db
    .collection(REGISTRATIONS_COLLECTION)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  return doc ? mapDocument(doc) : null
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

const performFindOrganisationById = (db) => async (id) => {
  if (!ObjectId.isValid(id)) {
    // gracefully handle when called with malformed id
    return null
  }

  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne(
      { _id: ObjectId.createFromHexString(id) },
      { projection: { _id: 1, orgId: 1, rawSubmissionData: 1 } }
    )

  return doc
    ? {
        id: doc._id.toString(),
        orgId: doc.orgId,
        rawSubmissionData: doc.rawSubmissionData
      }
    : null
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (db) => () => {
  return {
    findAllAccreditations: performFindAllAccreditations(db),
    findAccreditationsBySystemReference:
      performFindAccreditationsBySystemReference(db),
    findAccreditationById: performFindAccreditationById(db),
    findAllRegistrations: performFindAllRegistrations(db),
    findRegistrationsBySystemReference:
      performFindRegistrationsBySystemReference(db),
    findRegistrationById: performFindRegistrationById(db),
    findAllOrganisations: performFindAllOrganisations(db),
    findOrganisationById: performFindOrganisationById(db)
  }
}
