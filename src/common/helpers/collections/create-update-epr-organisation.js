/**
 * @import {CreateOrUpdateCollection} from './types.js'
 */

const collectionName = 'epr-organisations'

/**
 * Create or update the EPR Organisation collection
 *
 * Note: this collection is created without any schema validation
 * as we validate inserted data at the repository level
 *
 * @type {CreateOrUpdateCollection}
 */
export async function createOrUpdateEPROrganisationCollection(db, collections) {
  if (!collections.find(({ name }) => name === collectionName)) {
    await db.createCollection(collectionName)
  }

  // Create unique indexes to prevent duplicates
  await db
    .collection(collectionName)
    .createIndex({ orgId: 1 }, { unique: true })

  await db
    .collection(collectionName)
    .createIndex({ 'registrations.id': 1 }, { unique: true, sparse: true })

  await db.collection(collectionName).createIndex(
    { 'registrations.registrationNumber': 1 },
    {
      unique: true,
      partialFilterExpression: {
        'registrations.registrationNumber': { $type: 'string' }
      }
    }
  )

  await db
    .collection(collectionName)
    .createIndex({ 'accreditations.id': 1 }, { unique: true, sparse: true })

  await db.collection(collectionName).createIndex(
    { 'accreditations.accreditationNumber': 1 },
    {
      unique: true,
      partialFilterExpression: {
        'accreditations.accreditationNumber': { $type: 'string' }
      }
    }
  )
}
