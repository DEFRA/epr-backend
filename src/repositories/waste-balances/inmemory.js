import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'
import { randomUUID } from 'node:crypto'

/**
 * Create an in-memory waste balances repository.
 * Ensures data isolation by deep-cloning on read.
 *
 * @param {Array} [initialWasteBalances=[]]
 * @param {Object} [dependencies]
 * @returns {import('./port.js').WasteBalancesRepositoryFactory}
 */
export const createInMemoryWasteBalancesRepository = (
  initialWasteBalances = [],
  dependencies = {}
) => {
  // Don't clone wasteBalanceStorage to maintain reference for testing
  const wasteBalanceStorage = initialWasteBalances

  return () => ({
    async findByAccreditationId(accreditationId) {
      const validatedAccreditationId = validateAccreditationId(accreditationId)

      const balance = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )

      return balance ? structuredClone(balance) : null
    },

    async updateWasteBalanceTransactions(wasteRecords, accreditationId) {
      const validatedAccreditationId = validateAccreditationId(accreditationId)

      const { organisationsRepository } = dependencies
      if (!organisationsRepository) {
        throw new Error('organisationsRepository dependency is required')
      }

      const accreditation = await organisationsRepository.getAccreditationById(
        validatedAccreditationId
      )
      if (!accreditation) {
        throw new Error(`Accreditation not found: ${validatedAccreditationId}`)
      }

      let wasteBalance = wasteBalanceStorage.find(
        (b) => b.accreditationId === validatedAccreditationId
      )

      if (!wasteBalance) {
        if (wasteRecords.length === 0) {
          return
        }

        wasteBalance = {
          _id: randomUUID(),
          accreditationId: validatedAccreditationId,
          organisationId: wasteRecords[0].organisationId,
          amount: 0,
          availableAmount: 0,
          transactions: [],
          version: 0,
          schemaVersion: 1
        }
      }

      const { newTransactions, newAmount, newAvailableAmount } =
        calculateWasteBalanceUpdates({
          currentBalance: wasteBalance,
          wasteRecords,
          accreditation
        })

      if (newTransactions.length === 0) {
        return
      }

      const existingIndex = wasteBalanceStorage.findIndex(
        (b) => b.accreditationId === accreditationId
      )

      if (existingIndex === -1) {
        wasteBalanceStorage.push({
          ...wasteBalance,
          amount: newAmount,
          availableAmount: newAvailableAmount,
          transactions: newTransactions
        })
      } else {
        wasteBalanceStorage[existingIndex] = {
          ...wasteBalanceStorage[existingIndex],
          amount: newAmount,
          availableAmount: newAvailableAmount,
          transactions: [
            ...wasteBalanceStorage[existingIndex].transactions,
            ...newTransactions
          ]
        }
      }
    }
  })
}
