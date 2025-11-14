import {
  validateOrganisationId,
  validateRegistrationId,
  validateWasteRecord
} from './validation.js'

const COLLECTION_NAME = 'waste-records'
const SCHEMA_VERSION = 1

/**
 * Maps MongoDB document to domain model by removing internal MongoDB fields
 * and ensuring data isolation through deep cloning
 * @param {Object} doc - MongoDB document
 * @returns {import('./port.js').WasteRecord} Domain waste record
 */
const mapDocumentToDomain = (doc) => {
  const { _id, schemaVersion, ...domainFields } = doc
  return structuredClone(domainFields)
}

/**
 * Generates a composite key for waste record uniqueness
 * @param {import('./schema.js').WasteRecordKey} key - Composite key components
 * @returns {string} Composite key
 */
const getCompositeKey = ({ organisationId, registrationId, type, rowId }) => {
  return `${organisationId}:${registrationId}:${type}:${rowId}`
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
 * Builds a bulk upsert operation for a single waste record
 * @param {Object} record - Validated waste record
 * @returns {Object} MongoDB bulk write operation
 */
const buildUpsertOperation = (record) => {
  const compositeKey = getCompositeKey(record)

  return {
    updateOne: {
      filter: {
        _compositeKey: compositeKey
      },
      update: {
        $set: {
          _compositeKey: compositeKey,
          schemaVersion: SCHEMA_VERSION,
          ...structuredClone(record)
        }
      },
      upsert: true
    }
  }
}

const performUpsertWasteRecords = (db) => async (wasteRecords) => {
  if (wasteRecords.length === 0) {
    return
  }

  // Validate all records first
  const validatedRecords = wasteRecords.map((record) =>
    validateWasteRecord(record)
  )

  // Build bulk write operations
  const bulkOps = validatedRecords.map(buildUpsertOperation)

  await db.collection(COLLECTION_NAME).bulkWrite(bulkOps)
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
  const compositeKey = getCompositeKey(key)
  const existingSummaryLogIds = buildExistingSummaryLogIds()
  const versionExists = {
    $in: [versionData.version.summaryLog.id, existingSummaryLogIds]
  }

  return {
    updateOne: {
      filter: {
        _compositeKey: compositeKey
      },
      update: [
        {
          $set: {
            // Static fields - only set on insert
            _compositeKey: compositeKey,
            schemaVersion: SCHEMA_VERSION,
            ...key,
            // Current data - only update if version doesn't exist
            data: {
              $cond: {
                if: versionExists,
                then: '$data',
                else: structuredClone(versionData.data)
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
                    [structuredClone(versionData.version)]
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
  (db) => async (organisationId, registrationId, versionsByType) => {
    const validatedOrgId = validateOrganisationId(organisationId)
    const validatedRegId = validateRegistrationId(registrationId)

    if (versionsByType.size === 0) {
      return
    }

    // Build bulk write operations
    const bulkOps = []

    for (const [type, versionsByRowId] of versionsByType) {
      for (const [rowId, versionData] of versionsByRowId) {
        const key = {
          organisationId: validatedOrgId,
          registrationId: validatedRegId,
          type,
          rowId
        }

        bulkOps.push(buildAppendVersionOperation(key, versionData))
      }
    }

    await db.collection(COLLECTION_NAME).bulkWrite(bulkOps, { ordered: false })
  }

/**
 * Creates a MongoDB-backed waste records repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').WasteRecordsRepositoryFactory}
 */
export const createWasteRecordsRepository = (db) => () => {
  return {
    findByRegistration: performFindByRegistration(db),
    upsertWasteRecords: performUpsertWasteRecords(db),
    appendVersions: performAppendVersions(db)
  }
}
