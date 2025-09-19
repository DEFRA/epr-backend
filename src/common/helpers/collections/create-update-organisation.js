import {
  answers,
  createdAt,
  email,
  orgId,
  orgName,
  rawSubmissionData,
  schemaVersion,
  businessAddress,
  tradingName,
  companiesHouseNumber,
  organizationType,
  partnershipType,
  partners,
  reprocessingType,
  reprocessingNations,
  originalSubmitter
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
          rawSubmissionData,
          tradingName,
          businessAddress,
          companiesHouseNumber,
          organizationType,
          partnershipType,
          partners,
          reprocessingType,
          reprocessingNations,
          originalSubmitter
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
