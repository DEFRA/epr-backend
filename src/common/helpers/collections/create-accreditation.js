import {
  answers,
  createdAt,
  orgId,
  referenceNumber,
  rawSubmissionData,
  schemaVersion
} from './schema-properties.js'

export async function createAccreditationCollection(db) {
  await db.createCollection('accreditation', {
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
          rawSubmissionData
        }
      }
    }
  })
}
