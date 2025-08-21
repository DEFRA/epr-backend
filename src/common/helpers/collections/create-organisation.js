import { NATION, ORG_ID_START_NUMBER } from '../../enums/index.js'

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
          orgName: {
            bsonType: 'string',
            description: "'orgName' must be a string and is required"
          },
          email: {
            bsonType: 'string',
            description: "'email' must be a string and is required"
          },
          nations: {
            bsonType: 'array',
            description: "'nations' must be an array and is required",
            items: {
              bsonType: 'string',
              description: `'nation' must be one of [
                  ${NATION.ENGLAND},
                  ${NATION.NORTHERN_IRELAND},
                  ${NATION.SCOTLAND},
                  ${NATION.WALES}
                ] and is required`,
              oneOf: [
                { type: 'string', pattern: `^${NATION.ENGLAND}$` },
                { type: 'string', pattern: `^${NATION.NORTHERN_IRELAND}$` },
                { type: 'string', pattern: `^${NATION.SCOTLAND}$` },
                { type: 'string', pattern: `^${NATION.WALES}$` }
              ]
            }
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
