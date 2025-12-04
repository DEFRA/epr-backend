import { validateAccreditationId } from './validation.js'

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
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createWasteBalancesRepository = (db) => () => {
  return {
    findByAccreditationId: performFindByAccreditationId(db)
  }
}
