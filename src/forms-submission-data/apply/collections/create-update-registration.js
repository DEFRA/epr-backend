import {
  answers,
  createdAt,
  orgId,
  rawSubmissionData,
  referenceNumber,
  schemaVersion
} from './schema-properties.js'

/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

const collectionName = 'registration'

/**
 * @type {CreateOrUpdateCollection}
 */
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
