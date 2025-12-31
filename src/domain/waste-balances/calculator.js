import { randomUUID } from 'node:crypto'
import {
  extractWasteBalanceFields as extractExporterFields,
  isWithinAccreditationDateRange
} from '#domain/waste-balances/table-schemas/exporter/validators/waste-balance-extractor.js'
import { extractWasteBalanceFields as extractReprocessorInputFields } from '#domain/waste-balances/table-schemas/reprocessor-input/validators/waste-balance-extractor.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'

const FLOAT_PRECISION_THRESHOLD = 0.000001

/**
 * Create Transaction Object
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {number} amount
 * @param {number} currentAmount
 * @param {number} currentAvailableAmount
 * @param {import('#domain/waste-balances/model.js').WasteBalanceTransactionType} [type]
 */
export const buildTransaction = (
  record,
  amount,
  currentAmount,
  currentAvailableAmount,
  type = WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
) => {
  const openingAmount = currentAmount
  const openingAvailableAmount = currentAvailableAmount
  let closingAmount = currentAmount
  let closingAvailableAmount = currentAvailableAmount

  switch (type) {
    case WASTE_BALANCE_TRANSACTION_TYPE.DEBIT:
      closingAmount -= amount
      closingAvailableAmount -= amount
      break
    case WASTE_BALANCE_TRANSACTION_TYPE.CREDIT:
    default:
      closingAmount += amount
      closingAvailableAmount += amount
      break
  }

  return {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    createdBy: record.updatedBy,
    amount,
    openingAmount,
    closingAmount,
    openingAvailableAmount,
    closingAvailableAmount,
    entities: [
      {
        id: String(record.rowId),
        currentVersionId: record.versions?.[record.versions.length - 1]?.id,
        previousVersionIds:
          record.versions?.slice(0, -1).map((v) => v.id) || [],
        type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
      }
    ]
  }
}

/**
 * Updates the credited amount map with the transaction amount for each entity.
 * Credits increase the credited amount, Debits decrease it.
 * @param {Map<string, number>} creditedAmountMap
 * @param {import('#domain/waste-balances/model.js').WasteBalanceTransaction} transaction
 */
const updateCreditedAmountMap = (creditedAmountMap, transaction) => {
  const sign =
    transaction.type === WASTE_BALANCE_TRANSACTION_TYPE.CREDIT ? 1 : -1
  const netAmount = transaction.amount * sign

  const entityIds = (transaction.entities || []).map((e) => String(e.id))
  const uniqueEntityIds = new Set(entityIds)

  for (const id of uniqueEntityIds) {
    const currentCreditedAmount = creditedAmountMap.get(id) || 0
    creditedAmountMap.set(id, currentCreditedAmount + netAmount)
  }
}

/**
 * Calculates the target amount for a waste record based on accreditation.
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @returns {number}
 */
const getTargetAmount = (record, accreditation) => {
  const fields =
    extractExporterFields(record) || extractReprocessorInputFields(record)
  if (!fields) {
    return 0
  }

  const isWithinRange = isWithinAccreditationDateRange(
    fields.dispatchDate,
    accreditation
  )

  return isWithinRange && !fields.prnIssued ? fields.transactionAmount : 0
}

/**
 * Calculates new transactions and updated balance amounts based on waste records.
 * Implements a pipeline pattern to process each record through a series of steps.
 *
 * @param {Object} params
 * @param {import('#domain/waste-balances/model.js').WasteBalance} params.currentBalance - The current waste balance state.
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords - The waste records to process.
 * @param {Object} params.accreditation - The accreditation details.
 * @param {string} params.accreditation.validFrom - ISO date string.
 * @param {string} params.accreditation.validTo - ISO date string.
 * @returns {Object} Result containing new transactions and updated totals.
 * @property {Array<import('#domain/waste-balances/model.js').WasteBalanceTransaction>} newTransactions
 * @property {number} newAmount
 * @property {number} newAvailableAmount
 */
export const calculateWasteBalanceUpdates = ({
  currentBalance,
  wasteRecords,
  accreditation
}) => {
  const newTransactions = []
  let currentAmount = currentBalance.amount || 0
  let currentAvailableAmount = currentBalance.availableAmount || 0

  // Optimization: Pre-calculate credited amounts to avoid O(N*M) complexity
  const creditedAmountMap = new Map()

  // Initialize map with existing transactions
  ;(currentBalance.transactions || []).forEach((transaction) =>
    updateCreditedAmountMap(creditedAmountMap, transaction)
  )

  for (const record of wasteRecords) {
    const targetAmount = getTargetAmount(record, accreditation)

    // Calculate Already Credited Amount
    const alreadyCreditedAmount =
      creditedAmountMap.get(String(record.rowId)) || 0

    const delta = targetAmount - alreadyCreditedAmount

    // Only create transaction if there is a difference (handling float precision)
    if (Math.abs(delta) > FLOAT_PRECISION_THRESHOLD) {
      const type =
        delta > 0
          ? WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
          : WASTE_BALANCE_TRANSACTION_TYPE.DEBIT

      // Create Transaction
      const transaction = buildTransaction(
        record,
        Math.abs(delta),
        currentAmount,
        currentAvailableAmount,
        type
      )

      // Update State
      currentAmount = transaction.closingAmount
      currentAvailableAmount = transaction.closingAvailableAmount
      newTransactions.push(transaction)

      // Update map for next iteration
      updateCreditedAmountMap(creditedAmountMap, transaction)
    }
  }

  return {
    newTransactions,
    newAmount: currentAmount,
    newAvailableAmount: currentAvailableAmount
  }
}
