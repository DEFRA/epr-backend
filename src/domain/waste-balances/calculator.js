import { randomUUID } from 'node:crypto'
import { getFieldValue, COMMON_FIELD } from './field-mappings.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'

/**
 * Filter by Accreditation Date Range (AC03)
 */
export const isWithinAccreditationDateRange = (record, accreditation) => {
  const recordDateStr = getFieldValue(record, COMMON_FIELD.DISPATCH_DATE)
  if (!recordDateStr) {
    return false
  }

  const recordDate = new Date(recordDateStr)
  const validFrom = new Date(accreditation.validFrom)
  const validTo = new Date(accreditation.validTo)

  return recordDate >= validFrom && recordDate <= validTo
}

/**
 * Filter by PRN Status (AC02)
 */
export const hasPrnBeenIssued = (record) => {
  const prnIssued = getFieldValue(record, COMMON_FIELD.PRN_ISSUED)
  return prnIssued && prnIssued.toLowerCase() === 'yes'
}

/**
 * Calculate Transaction Amount (AC01a, AC01b)
 */
export const getTransactionAmount = (record) => {
  const interimSite = getFieldValue(record, COMMON_FIELD.INTERIM_SITE)
  if (interimSite && interimSite.toLowerCase() === 'yes') {
    return Number(getFieldValue(record, COMMON_FIELD.INTERIM_TONNAGE) || 0)
  }
  return Number(getFieldValue(record, COMMON_FIELD.EXPORT_TONNAGE) || 0)
}

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
    case WASTE_BALANCE_TRANSACTION_TYPE.CREDIT:
      closingAmount += amount
      closingAvailableAmount += amount
      break
    case WASTE_BALANCE_TRANSACTION_TYPE.DEBIT:
      closingAmount -= amount
      closingAvailableAmount -= amount
      break
    case WASTE_BALANCE_TRANSACTION_TYPE.PENDING_DEBIT:
      closingAvailableAmount -= amount
      break
  }

  return {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    amount,
    openingAmount,
    closingAmount,
    openingAvailableAmount,
    closingAvailableAmount,
    entities: [
      {
        id: record.rowId,
        type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
      }
    ]
  }
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

  for (const record of wasteRecords) {
    if (
      isWithinAccreditationDateRange(record, accreditation) &&
      !hasPrnBeenIssued(record)
    ) {
      // Calculate Amount
      const amount = getTransactionAmount(record)

      if (amount > 0) {
        // Create Transaction
        const transaction = buildTransaction(
          record,
          amount,
          currentAmount,
          currentAvailableAmount
        )

        // Update State
        currentAmount = transaction.closingAmount
        currentAvailableAmount = transaction.closingAvailableAmount
        newTransactions.push(transaction)
      }
    }
  }

  return {
    newTransactions,
    newAmount: currentAmount,
    newAvailableAmount: currentAvailableAmount
  }
}
