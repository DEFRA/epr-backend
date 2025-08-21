import { ORG_ID_START_NUMBER } from '../../enums/index.js'

export async function createRegistrationCollection(db) {
  await db.createCollection('registration', {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        title: 'Registration Validation',
        required: [
          'schemaVersion',
          'createdAt',
          'referenceNumber',
          'orgId',
          'answers',
          'rawSubmissionData'
        ],
        properties: {
          schemaVersion: {
            bsonType: 'int',
            minimum: 1,
            description:
              "'schemaVersion' must be a positive integer and is required"
          },
          createdAt: {
            bsonType: 'date',
            description: "'createdAt' must be a date and is required"
          },
          orgId: {
            bsonType: 'int',
            minimum: ORG_ID_START_NUMBER,
            description: `'orgId' must be a positive integer above ${ORG_ID_START_NUMBER} and is required`
          },
          referenceNumber: {
            bsonType: 'string',
            pattern: '^[0-9a-fA-F]{24}$',
            description: "'referenceNumber' must be a string and is required"
          },
          answers: {
            bsonType: 'array',
            description: "'answers' must be an array and is required",
            items: {
              bsonType: 'object',
              required: ['shortDescription', 'title', 'type', 'value'],
              properties: {
                shortDescription: {
                  bsonType: 'string',
                  description:
                    "'shortDescription' must be a string and is required"
                },
                type: {
                  bsonType: 'string',
                  description: "'type' must be a string and is required"
                },
                title: {
                  bsonType: 'string',
                  description: "'title' must be a string and is required"
                },
                value: {
                  bsonType: 'string',
                  description: "'value' must be a string and is required"
                }
              }
            }
          },
          rawSubmissionData: {
            bsonType: 'object',
            description: "'rawSubmissionData' must be an object and is required"
          }
        }
      }
    }
  })
}
