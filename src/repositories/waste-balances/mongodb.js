import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'

const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(WASTE_BALANCE_COLLECTION_NAME)

  // Optimises waste balance lookups by accreditation ID
  // Each accreditation has at most one balance document
  await collection.createIndex({ accreditationId: 1 }, { unique: true })

  return collection
}

const performFindByAccreditationId = (db) => async (accreditationId) => {
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const doc = await db
    .collection(WASTE_BALANCE_COLLECTION_NAME)
    .findOne({ accreditationId: validatedAccreditationId })

  if (!doc) {
    return null
  }

  const { _id, ...domainFields } = doc
  return structuredClone({ id: _id.toString(), ...domainFields })
}

const performFindByAccreditationIds = (db) => async (accreditationIds) => {
  const docs = await db
    .collection(WASTE_BALANCE_COLLECTION_NAME)
    .find({ accreditationId: { $in: accreditationIds } })
    .toArray()

  return docs.map((doc) => {
    const { _id, ...domainFields } = doc
    return structuredClone({ id: _id.toString(), ...domainFields })
  })
}

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('mongodb').Db} db
 * @returns {(id: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>}
 */
export const findBalance = (db) => async (id) => {
  const doc = await db
    .collection(WASTE_BALANCE_COLLECTION_NAME)
    .findOne({ accreditationId: id })

  if (!doc) {
    return null
  }

  const { _id, ...domainFields } = doc
  return /** @type {import('#domain/waste-balances/model.js').WasteBalance} */ (
    structuredClone({ id: _id.toString(), ...domainFields })
  )
}

/**
 * Save a waste balance.
 *
 * @param {import('mongodb').Db} db
 * @returns {(updatedBalance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[], request?: Object) => Promise<void>}
 */
export const saveBalance =
  (db) => async (updatedBalance, newTransactions, request) => {
    await db.collection(WASTE_BALANCE_COLLECTION_NAME).updateOne(
      { accreditationId: updatedBalance.accreditationId },
      /** @type {*} */ ({
        $set: {
          amount: updatedBalance.amount,
          availableAmount: updatedBalance.availableAmount,
          version: updatedBalance.version,
          schemaVersion: updatedBalance.schemaVersion
        },
        $push: {
          transactions: { $each: newTransactions }
        },
        $setOnInsert: {
          _id: updatedBalance.id,
          organisationId: updatedBalance.organisationId
        }
      }),
      { upsert: true }
    )
  }

/**
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} [dependencies] - Optional dependencies
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} [dependencies.organisationsRepository]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @returns {Promise<import('./port.js').WasteBalancesRepositoryFactory>}
 */
export const createWasteBalancesRepository = async (db, dependencies = {}) => {
  await ensureCollection(db)

  return () => ({
    findByAccreditationId: performFindByAccreditationId(db),
    findByAccreditationIds: performFindByAccreditationIds(db),
    updateWasteBalanceTransactions: async (
      wasteRecords,
      accreditationId,
      request
    ) => {
      return performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId,
        dependencies,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        request
      })
    }
  })
}
