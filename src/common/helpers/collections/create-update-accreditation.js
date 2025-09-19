import {
  answers,
  createdAt,
  orgId,
  referenceNumber,
  rawSubmissionData,
  schemaVersion,
  accreditationYear,
  accreditationStatus,
  glassProcess,
  tonnageBand,
  overseasSites
} from './schema-properties.js'

const collectionName = 'accreditation'

export async function createOrUpdateAccreditationCollection(db, collections) {
  const options = {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        title: 'Accreditation Validation',
        required: [
          'schemaVersion',
          'createdAt',
          'orgId',
          'referenceNumber',
          'answers',
          'rawSubmissionData'
        ],
        properties: {
          schemaVersion,
          createdAt,
          orgId,
          referenceNumber,
          answers,
          rawSubmissionData,
          accreditationStatus,
          accreditationYear,
          glassProcess,
          tonnageBand,
          overseasSites
        }
      }
    }
  }

  if (!collections.find(({ name }) => name === collectionName)) {
    await db.createCollection(collectionName, options)
  } else {
    await db.command({ collMod: collectionName, ...options })
  }
}
