import {
  answers,
  createdAt,
  email,
  nations,
  orgId,
  orgName,
  rawSubmissionData,
  schemaVersion
} from './schema-properties.js'

export async function createOrganisationCollection(db) {
  await db.createCollection('organisation', {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        title: 'Organisation Validation',
        required: [
          'schemaVersion',
          'createdAt',
          'orgId',
          'orgName',
          'email',
          'nations',
          'answers',
          'rawSubmissionData'
        ],
        properties: {
          schemaVersion,
          createdAt,
          orgId,
          orgName,
          email,
          nations,
          answers,
          rawSubmissionData
        }
      }
    }
  })
}
