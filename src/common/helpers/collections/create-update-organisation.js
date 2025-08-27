import {
  answers,
  createdAt,
  email,
  orgId,
  orgName,
  rawSubmissionData,
  schemaVersion
} from './schema-properties.js'

const collectionName = 'organisation'

export async function createOrUpdateOrganisationCollection(db, collections) {
  const options = {
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
          'answers',
          'rawSubmissionData'
        ],
        properties: {
          schemaVersion,
          createdAt,
          orgId,
          orgName,
          email,
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
