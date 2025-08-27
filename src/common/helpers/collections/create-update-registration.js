import {
  answers,
  createdAt,
  orgId,
  referenceNumber,
  rawSubmissionData,
  schemaVersion
} from './schema-properties.js'

const collectionName = 'registration'

export async function createOrUpdateRegistrationCollection(db, collections) {
  const options = {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        title: 'Registration Validation',
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
          rawSubmissionData
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
