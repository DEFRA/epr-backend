import { validateOrganisationId, validateRegistrationId } from './validation.js'

const COLLECTION_NAME = 'waste-records'
const SCHEMA_VERSION = 1

/**
 * Maps MongoDB document to domain model by removing internal MongoDB fields
 * and ensuring data isolation through deep cloning
 * @param {Object} doc - MongoDB document
 * @returns {import('./port.js').WasteRecord} Domain waste record
 */
const mapDocumentToDomain = (doc) => {
  const { _id, schemaVersion: _s, ...domainFields } = doc
  return structuredClone(domainFields)
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
 * @param {string | undefined} accreditationId
 * @param {Object} versionData
 * @returns {Object} MongoDB update operation
 */
const buildAppendVersionOperation = (key, accreditationId, versionData) => {
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
            accreditationId,
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
  (db) =>
  async (
    organisationId,
    registrationId,
    accreditationId,
    wasteRecordVersions
  ) => {
    const validatedOrgId = validateOrganisationId(organisationId)
    const validatedRegId = validateRegistrationId(registrationId)

    if (wasteRecordVersions.size === 0) {
      return
    }

    // Build bulk write operations
    const bulkOps = []

    for (const [type, versionsByRowId] of wasteRecordVersions) {
      for (const [rowId, versionData] of versionsByRowId) {
        const key = {
          organisationId: validatedOrgId,
          registrationId: validatedRegId,
          type,
          rowId
        }

        bulkOps.push(
          buildAppendVersionOperation(key, accreditationId, versionData)
        )
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
    appendVersions: performAppendVersions(db)
  }
}
