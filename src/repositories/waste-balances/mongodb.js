import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'

const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const performFindByAccreditationId = (db) => async (accreditationId) => {
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const doc = await db
    .collection(WASTE_BALANCE_COLLECTION_NAME)
    .findOne({ accreditationId: validatedAccreditationId })

  if (!doc) {
    return null
  }

  // Map MongoDB document to domain model by removing MongoDB _id from root
  // but keeping it in nested transactions
  const { _id, ...domainFields } = doc
  return structuredClone({ _id: _id.toString(), ...domainFields })
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
  if (!doc) return null
  const { _id, ...domainFields } = doc
  return structuredClone({ _id: _id.toString(), ...domainFields })
}

/**
 * Save a waste balance.
 *
 * @param {import('mongodb').Db} db
 * @returns {(updatedBalance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>}
 */
export const saveBalance = (db) => async (updatedBalance, newTransactions) => {
  await db.collection(WASTE_BALANCE_COLLECTION_NAME).updateOne(
    { accreditationId: updatedBalance.accreditationId },
    {
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
        _id: updatedBalance._id,
        organisationId: updatedBalance.organisationId
      }
    },
    { upsert: true }
  )
}

/**
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} [dependencies] - Optional dependencies
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} [dependencies.organisationsRepository]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createWasteBalancesRepository = (db, dependencies = {}) => {
  return () => ({
    findByAccreditationId: performFindByAccreditationId(db),
    updateWasteBalanceTransactions: async (wasteRecords, accreditationId) => {
      return performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId,
        dependencies,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db)
      })
    }
  })
}
