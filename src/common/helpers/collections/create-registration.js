import {
  answers,
  createdAt,
  orgId,
  referenceNumber,
  rawSubmissionData,
  schemaVersion
} from './schema-properties.js'

export async function createRegistrationCollection(db) {
  await db.createCollection('registration', {
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
  })
}
