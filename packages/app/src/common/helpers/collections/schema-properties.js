import { ORG_ID_START_NUMBER } from '../../enums/index.js'

export const answers = {
  bsonType: 'array',
  description: "'answers' must be an array and is required",
  items: {
    bsonType: 'object',
    required: ['shortDescription', 'title', 'type', 'value'],
    properties: {
      shortDescription: {
        bsonType: 'string',
        description: "'shortDescription' must be a string and is required"
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
}

export const createdAt = {
  bsonType: 'date',
  description: "'createdAt' must be a date and is required"
}

export const email = {
  bsonType: 'string',
  description: "'email' must be a string and is required"
}

export const orgId = {
  bsonType: 'int',
  minimum: ORG_ID_START_NUMBER,
  description: `'orgId' must be a positive integer above ${ORG_ID_START_NUMBER} and is required`
}

export const orgName = {
  bsonType: 'string',
  description: "'orgName' must be a string and is required"
}

export const rawSubmissionData = {
  bsonType: 'object',
  description: "'rawSubmissionData' must be an object and is required"
}

export const referenceNumber = {
  bsonType: 'string',
  pattern: '^[0-9a-fA-F]{24}$',
  description: "'referenceNumber' must be a string and is required"
}

export const schemaVersion = {
  bsonType: 'int',
  minimum: 1,
  description: "'schemaVersion' must be a positive integer and is required"
}
