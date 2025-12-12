import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'
import { randomUUID } from 'node:crypto'

/**
 * Create a new waste balance object.
 *
 * @param {string} accreditationId
 * @param {string} organisationId
 * @returns {import('#domain/waste-balances/model.js').WasteBalance}
 */
export const createNewWasteBalance = (accreditationId, organisationId) => ({
  id: randomUUID(),
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  transactions: [],
  version: 0,
  schemaVersion: 1
})

/**
 * Find an existing waste balance or create a new one if allowed.
 *
 * @param {Object} params
 * @param {(id: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {string} params.accreditationId
 * @param {string} [params.organisationId]
 * @param {boolean} params.shouldCreate
 * @returns {Promise<import('#domain/waste-balances/model.js').WasteBalance | null>}
 */
export const findOrCreateWasteBalance = async ({
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
 * @param {Object} [params.dependencies.organisationsRepository]
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
  if (wasteRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const { organisationsRepository } = dependencies
  if (!organisationsRepository) {
    throw new Error('organisationsRepository dependency is required')
  }

  const accreditation = await organisationsRepository.findAccreditationById(
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

  /* c8 ignore next 3 */
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
