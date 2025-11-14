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
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {string} type
 * @param {string} rowId
 * @returns {string} Composite key
 */
const getCompositeKey = (organisationId, registrationId, type, rowId) => {
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

const performUpsertWasteRecords = (db) => async (wasteRecords) => {
  if (wasteRecords.length === 0) {
    return
  }

  // Validate all records first
  const validatedRecords = wasteRecords.map((record) =>
    validateWasteRecord(record)
  )

  // Build bulk write operations
  const bulkOps = validatedRecords.map((record) => {
    const compositeKey = getCompositeKey(
      record.organisationId,
      record.registrationId,
      record.type,
      record.rowId
    )

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
  })

  await db.collection(COLLECTION_NAME).bulkWrite(bulkOps)
}

const performAppendVersions =
  (db) => async (organisationId, registrationId, versionsByKey) => {
    const validatedOrgId = validateOrganisationId(organisationId)
    const validatedRegId = validateRegistrationId(registrationId)

    if (versionsByKey.size === 0) {
      return
    }

    // Build bulk write operations
    const bulkOps = []

    for (const [key, versionData] of versionsByKey) {
      // Parse the key to extract type and rowId
      const [type, rowId] = key.split(':')

      const compositeKey = getCompositeKey(
        validatedOrgId,
        validatedRegId,
        type,
        rowId
      )

      bulkOps.push({
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
                organisationId: validatedOrgId,
                registrationId: validatedRegId,
                type,
                rowId,
                // Current data - only update if version doesn't exist
                data: {
                  $cond: {
                    if: {
                      $in: [
                        versionData.version.summaryLog.id,
                        {
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
                        }
                      ]
                    },
                    then: '$data',
                    else: structuredClone(versionData.data)
                  }
                },
                // Versions array - conditionally append if summaryLog.id doesn't exist
                versions: {
                  $cond: {
                    if: {
                      $in: [
                        versionData.version.summaryLog.id,
                        {
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
                        }
                      ]
                    },
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
      })
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
