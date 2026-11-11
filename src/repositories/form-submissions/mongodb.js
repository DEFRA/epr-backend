import { ObjectId } from 'mongodb'
import { ORG_ID_START_NUMBER } from '#common/enums/db.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */

const ACCREDITATIONS_COLLECTION = 'accreditation'
const REGISTRATIONS_COLLECTION = 'registration'
const ORGANISATION_COLLECTION = 'organisation'
const COUNTERS_COLLECTION = 'counters'

/**
 * Ensures the collections exist with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @param {Pick<OrganisationAdministrationRepository, 'findHighestOrganisationNumber'>} organisationAdministrationRepository
 */
async function ensureCollections(
  db,
  logger,
  organisationAdministrationRepository
) {
  await db.collection(ORGANISATION_COLLECTION).createIndex({ orgId: 1 })
  await db
    .collection(REGISTRATIONS_COLLECTION)
    .createIndex({ referenceNumber: 1 })
  await db
    .collection(ACCREDITATIONS_COLLECTION)
    .createIndex({ referenceNumber: 1 })

  await seedOrgIdCounter(db, logger, organisationAdministrationRepository)
}

/**
 * Finds the highest orgId across form-submissions and organisations.
 *
 * @param {import('mongodb').Db} db
 * @param {Pick<OrganisationAdministrationRepository, 'findHighestOrganisationNumber'>} organisationAdministrationRepository
 * @returns {Promise<number>}
 */
async function findHighestOrgId(db, organisationAdministrationRepository) {
  const [[formsDoc], highestOrganisationNumber] = await Promise.all([
    db
      .collection(ORGANISATION_COLLECTION)
      .find({ orgId: { $gte: ORG_ID_START_NUMBER } })
      .sort({ orgId: -1 })
      .limit(1)
      .toArray(),
    organisationAdministrationRepository.findHighestOrganisationNumber()
  ])

  return Math.max(
    formsDoc?.orgId ?? ORG_ID_START_NUMBER,
    Number(highestOrganisationNumber ?? ORG_ID_START_NUMBER)
  )
}

/**
 * Seeds the orgId counter from existing data on first run.
 * Uses $setOnInsert so it only writes when the counter doesn't exist yet.
 *
 * @param {import('mongodb').Db} db
 * @param {TypedLogger} logger
 * @param {Pick<OrganisationAdministrationRepository, 'findHighestOrganisationNumber'>} organisationAdministrationRepository
 */
async function seedOrgIdCounter(
  db,
  logger,
  organisationAdministrationRepository
) {
  const seq = await findHighestOrgId(db, organisationAdministrationRepository)

  await db
    .collection(COUNTERS_COLLECTION)
    .updateOne(
      { _id: /** @type {*} */ ('orgId') },
      { $setOnInsert: { seq } },
      { upsert: true }
    )

  logger.info({ message: `orgId counter seeded at ${seq}` })
}

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
    .find({ referenceNumber: new RegExp(`^${ref}$`, 'i') })
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
    .find({ referenceNumber: new RegExp(`^${ref}$`, 'i') })
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
    .collection(ORGANISATION_COLLECTION)
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
    .collection(ORGANISATION_COLLECTION)
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

const findAllFormSubmissionIds = (db) => async () => {
  const getAllSubmissionIds = async (collectionName) => {
    const docs = await db
      .collection(collectionName)
      .find({}, { projection: { _id: 1 } })
      .toArray()
    return new Set(docs.map((doc) => doc._id.toString()))
  }

  const [organisations, registrations, accreditations] = await Promise.all([
    getAllSubmissionIds(ORGANISATION_COLLECTION),
    getAllSubmissionIds(REGISTRATIONS_COLLECTION),
    getAllSubmissionIds(ACCREDITATIONS_COLLECTION)
  ])

  return { organisations, registrations, accreditations }
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Pick<OrganisationAdministrationRepository, 'findHighestOrganisationNumber'>} organisationAdministrationRepository
 * @returns {Promise<import('./port.js').FormSubmissionsRepositoryFactory>}
 */
export const createFormSubmissionsRepository = async (
  db,
  logger,
  organisationAdministrationRepository
) => {
  await ensureCollections(db, logger, organisationAdministrationRepository)

  return () => {
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
      findOrganisationById: performFindOrganisationById(db),
      findAllFormSubmissionIds: findAllFormSubmissionIds(db)
    }
  }
}
