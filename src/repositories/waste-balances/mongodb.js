import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'

const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const performUpdateWasteBalanceTransactions =
  (db, dependencies) => async (wasteRecords, accreditationId) => {
    const { organisationsRepository } = dependencies
    if (!organisationsRepository) {
      throw new Error('organisationsRepository dependency is required')
    }

    // 1. Fetch Context
    const accreditation =
      await organisationsRepository.getAccreditationById(accreditationId)
    if (!accreditation) {
      throw new Error(`Accreditation not found: ${accreditationId}`)
    }

    // 2. Fetch or Initialize Waste Balance
    let wasteBalance = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .findOne({ accreditationId })

    if (!wasteBalance) {
      // Initialize new balance if not exists
      wasteBalance = {
        accreditationId,
        organisationId: wasteRecords[0]?.organisationId, // Assume all records belong to same org
        amount: 0,
        availableAmount: 0,
        transactions: [],
        version: 0,
        schemaVersion: 1
      }
    }

    // 3. Calculate Updates
    const { newTransactions, newAmount, newAvailableAmount } =
      calculateWasteBalanceUpdates({
        currentBalance: wasteBalance,
        wasteRecords,
        accreditation
      })

    if (newTransactions.length === 0) {
      return
    }

    // 4. Persist Updates
    const existing = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .findOne({ accreditationId })

    if (!existing) {
      await db.collection(WASTE_BALANCE_COLLECTION_NAME).insertOne({
        ...wasteBalance,
        amount: newAmount,
        availableAmount: newAvailableAmount,
        transactions: newTransactions
      })
    } else {
      await db.collection(WASTE_BALANCE_COLLECTION_NAME).updateOne(
        { accreditationId },
        {
          $set: {
            amount: newAmount,
            availableAmount: newAvailableAmount
          },
          $push: {
            transactions: { $each: newTransactions }
          }
        }
      )
    }
  }

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
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} [dependencies] - Optional dependencies
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} [dependencies.organisationsRepository]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createWasteBalancesRepository =
  (db, dependencies = {}) =>
  () => {
    return {
      findByAccreditationId: performFindByAccreditationId(db),
      updateWasteBalanceTransactions: performUpdateWasteBalanceTransactions(
        db,
        dependencies
      )
    }
  }
