import { validateOrganisationId, validateRegistrationId } from './validation.js'
import {
  mapMongoDocumentToDomain,
  mapVersionDataForMongoPersistence
} from './decimal-normalisation.js'

const COLLECTION_NAME = 'waste-records'
const SCHEMA_VERSION = 1

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  await collection.createIndex(
    { organisationId: 1, registrationId: 1, type: 1, rowId: 1 },
    { unique: true }
  )

  return collection
}

/**
 * Maps MongoDB document to domain model by removing internal MongoDB fields
 * and ensuring data isolation through deep cloning
 * @param {Object} doc - MongoDB document
 * @returns {import('./port.js').WasteRecord} Domain waste record
 */
const mapDocumentToDomain = (doc) => {
  const { _id, schemaVersion: _s, ...domainFields } = doc
  return structuredClone(mapMongoDocumentToDomain(domainFields))
}

const performFindByRegistration =
  (db) => async (organisationId, registrationId) => {
    const validatedOrgId = validateOrganisationId(organisationId)
    const validatedRegId = validateRegistrationId(registrationId)

    const docs = await db
      .collection(COLLECTION_NAME)
      .find({
        organisationId: validatedOrgId,
        registrationId: validatedRegId
      })
      .toArray()

    return docs.map(mapDocumentToDomain)
  }

/**
 * Builds MongoDB aggregation expression to extract existing summary log IDs
 * @returns {Object} MongoDB aggregation expression
 */
const buildExistingSummaryLogIds = () => ({
  $ifNull: [
    {
      $map: {
        input: '$versions',
        as: 'v',
        in: '$$v.summaryLog.id'
      }
    },
    []
  ]
})

/**
 * Builds MongoDB update operation for appending a version
 * @param {import('./schema.js').WasteRecordKey} key - Composite key identifying the record
 * @param {Object} versionData
 * @returns {Object} MongoDB update operation
 */
const buildAppendVersionOperation = (key, versionData) => {
  const existingSummaryLogIds = buildExistingSummaryLogIds()
  const versionExists = {
    $in: [versionData.version.summaryLog.id, existingSummaryLogIds]
  }

  return {
    updateOne: {
      filter: key,
      update: [
        {
          $set: {
            // Static fields - only set on insert
            schemaVersion: SCHEMA_VERSION,
            ...key,
            // Current data - only update if version doesn't exist
            data: {
              $cond: {
                if: versionExists,
                then: '$data',
                else: versionData.data
              }
            },
            // Versions array - conditionally append if summaryLog.id doesn't exist
            versions: {
              $cond: {
                if: versionExists,
                then: '$versions',
                else: {
                  $concatArrays: [
                    { $ifNull: ['$versions', []] },
                    [versionData.version]
                  ]
                }
              }
            }
          }
        }
      ],
      upsert: true
    }
  }
}

const performAppendVersions =
  (db) => async (organisationId, registrationId, wasteRecordVersions) => {
    const validatedOrgId = validateOrganisationId(organisationId)
    const validatedRegId = validateRegistrationId(registrationId)

    if (wasteRecordVersions.size === 0) {
      return
    }

    // Build bulk write operations
    const bulkOps = []

    for (const [type, versionsByRowId] of wasteRecordVersions) {
      for (const [rowId, versionData] of versionsByRowId) {
        const normalisedVersionData =
          mapVersionDataForMongoPersistence(versionData)
        const key = {
          organisationId: validatedOrgId,
          registrationId: validatedRegId,
          type,
          rowId
        }

        bulkOps.push(buildAppendVersionOperation(key, normalisedVersionData))
      }
    }

    await db.collection(COLLECTION_NAME).bulkWrite(bulkOps, { ordered: false })
  }

/**
 * Creates a MongoDB-backed waste records repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {Promise<import('./port.js').WasteRecordsRepositoryFactory>}
 */
export const createWasteRecordsRepository = async (db) => {
  await ensureCollection(db)

  return () => {
    return {
      findByRegistration: performFindByRegistration(db),
      appendVersions: performAppendVersions(db)
    }
  }
}
