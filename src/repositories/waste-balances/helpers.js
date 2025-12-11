import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'
import { randomUUID } from 'node:crypto'

export const createNewWasteBalance = (accreditationId, organisationId) => ({
  _id: randomUUID(),
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  transactions: [],
  version: 0,
  schemaVersion: 1
})

const findOrCreateWasteBalance = async ({
  findBalance,
  accreditationId,
  organisationId,
  shouldCreate
}) => {
  const wasteBalance = await findBalance(accreditationId)

  if (wasteBalance) {
    return wasteBalance
  }

  if (!shouldCreate) {
    return null
  }

  return createNewWasteBalance(accreditationId, organisationId)
}

/**
 * Shared logic for updating waste balance transactions.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {string} params.accreditationId
 * @param {Object} params.dependencies
 * @param {Object} params.dependencies.organisationsRepository
 * @param {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditationId,
  dependencies,
  findBalance,
  saveBalance
}) => {
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

  const wasteBalance = await findOrCreateWasteBalance({
    findBalance,
    accreditationId: validatedAccreditationId,
    organisationId: wasteRecords[0]?.organisationId,
    shouldCreate: wasteRecords.length > 0
  })

  if (!wasteBalance) {
    return
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

  const updatedBalance = {
    ...wasteBalance,
    amount: newAmount,
    availableAmount: newAvailableAmount,
    transactions: [...(wasteBalance.transactions || []), ...newTransactions]
  }

  await saveBalance(updatedBalance, newTransactions)
}
