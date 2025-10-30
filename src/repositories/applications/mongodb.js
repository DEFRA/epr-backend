import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  validateAccreditation,
  validateRegistration,
  validateOrganisation
} from './validation.js'

const ACCREDITATION_COLLECTION = 'accreditation'
const REGISTRATION_COLLECTION = 'registration'
const ORGANISATION_COLLECTION = 'organisation'

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').ApplicationsRepositoryFactory}
 */
export const createApplicationsRepository = (db) => (logger) => ({
  async insertAccreditation(data) {
    const validated = validateAccreditation(data)
    await db.collection(ACCREDITATION_COLLECTION).insertOne(validated)
  },

  async insertRegistration(data) {
    const validated = validateRegistration(data)
    await db.collection(REGISTRATION_COLLECTION).insertOne(validated)
  },

  async insertOrganisation(data) {
    const validated = validateOrganisation(data)
    const collection = db.collection(ORGANISATION_COLLECTION)

    const count = await collection.countDocuments({
      orgId: {
        $gte: ORG_ID_START_NUMBER
      }
    })
    const orgId = ORG_ID_START_NUMBER + count + 1

    const { insertedId } = await collection.insertOne({
      ...validated,
      orgId
    })

    return {
      orgId,
      referenceNumber: insertedId.toString()
    }
  }
})
