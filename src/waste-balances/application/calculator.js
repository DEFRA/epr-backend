import { randomUUID } from 'node:crypto'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '../domain/model.js'
import {
  add,
  subtract,
  toNumber,
  isZero,
  abs,
  greaterThan,
  multiply
} from '#common/helpers/decimal-utils.js'

/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * Create Transaction Object
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {number} amount
 * @param {number} currentAmount
 * @param {number} currentAvailableAmount
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} user
 * @param {import('../domain/model.js').WasteBalanceTransactionType} [type]
 */
export const buildTransaction = (
  record,
  amount,
  currentAmount,
  currentAvailableAmount,
  user,
  type = WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
) => {
  const openingAmount = currentAmount
  const openingAvailableAmount = currentAvailableAmount
  let closingAmount
  let closingAvailableAmount

  switch (type) {
    case WASTE_BALANCE_TRANSACTION_TYPE.DEBIT:
      closingAmount = toNumber(subtract(currentAmount, amount))
      closingAvailableAmount = toNumber(
        subtract(currentAvailableAmount, amount)
      )
      break
    case WASTE_BALANCE_TRANSACTION_TYPE.CREDIT:
    default:
      closingAmount = toNumber(add(currentAmount, amount))
      closingAvailableAmount = toNumber(add(currentAvailableAmount, amount))
      break
  }

  return {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    createdBy: { id: user.id, name: user.email },
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
 * @param {import('../domain/model.js').WasteBalanceTransaction} transaction
 */
const updateCreditedAmountMap = (creditedAmountMap, transaction) => {
  const sign =
    transaction.type === WASTE_BALANCE_TRANSACTION_TYPE.CREDIT ? 1 : -1
  const netAmount = multiply(transaction.amount, sign)

  const entityIds = (transaction.entities || []).map((e) => String(e.id))
  const uniqueEntityIds = new Set(entityIds)

  for (const id of uniqueEntityIds) {
    const currentCreditedAmount = creditedAmountMap.get(id) || 0
    creditedAmountMap.set(id, toNumber(add(currentCreditedAmount, netAmount)))
  }
}

// PRN_ACCEPTED has no builder today; included for forward-compat so any future
// PRN_ACCEPTED transaction that conserves opening/closing semantics is picked
// up without another diff here.
const PRN_ENTITY_TYPES = new Set([
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CREATED,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_ISSUED,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_ACCEPTED,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED_POST_ISSUE
])

const isPrnTransaction = (transaction) =>
  (transaction.entities || []).some((entity) =>
    PRN_ENTITY_TYPES.has(entity.type)
  )

/**
 * Sums the net effect of PRN transactions on both balance fields in a single
 * pass. Waste-record transactions are excluded because they are keyed by
 * naked rowId and can silently lose data under a rowId collision (PAE-1380);
 * the waste-record contribution is derived directly from the waste records
 * themselves.
 *
 * @param {Array<import('../domain/model.js').WasteBalanceTransaction>} transactions
 * @returns {{ amount: number, availableAmount: number }}
 */
const sumPrnTransactionAdjustments = (transactions) => {
  let amount = 0
  let availableAmount = 0
  for (const transaction of transactions) {
    if (!isPrnTransaction(transaction)) {
      continue
    }
    amount = toNumber(
      add(
        amount,
        subtract(transaction.closingAmount ?? 0, transaction.openingAmount ?? 0)
      )
    )
    availableAmount = toNumber(
      add(
        availableAmount,
        subtract(
          transaction.closingAvailableAmount ?? 0,
          transaction.openingAvailableAmount ?? 0
        )
      )
    )
  }
  return { amount, availableAmount }
}

/**
 * Calculates the target amount for a waste record based on accreditation.
 * @param {import('#domain/waste-records/model.js').WasteRecord} record
 * @param {Object} accreditation
 * @param {OverseasSitesContext} overseasSites
 * @returns {number}
 */
const getTargetAmount = (record, accreditation, overseasSites) => {
  if (record.excludedFromWasteBalance) {
    return 0
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema?.classifyForWasteBalance) {
    return 0
  }

  /** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').WasteBalanceClassificationResult} */
  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })
  return result.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * Calculates new transactions and updated balance amounts based on waste records.
 * Implements a pipeline pattern to process each record through a series of steps.
 *
 * @param {Object} params
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance - The current waste balance state.
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords - The waste records to process.
 * @param {Object} params.accreditation - The accreditation details.
 * @param {string} [params.accreditation.validFrom] - ISO date string.
 * @param {string} [params.accreditation.validTo] - ISO date string.
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user - Authenticated user driving the submit.
 * @param {OverseasSitesContext} params.overseasSites - Resolved ORS lookup map or ORS_VALIDATION_DISABLED.
 * @returns {Object} Result containing new transactions and updated totals.
 * @property {Array<import('../domain/model.js').WasteBalanceTransaction>} newTransactions
 * @property {number} newAmount
 * @property {number} newAvailableAmount
 */
export const calculateWasteBalanceUpdates = ({
  currentBalance,
  wasteRecords,
  accreditation,
  user,
  overseasSites
}) => {
  const newTransactions = []
  let currentAmount = currentBalance.amount || 0
  let currentAvailableAmount = currentBalance.availableAmount || 0
  const historicTransactions = currentBalance.transactions || []

  // Per-record transactions remain the audit ledger. They still drive the
  // per-row delta and closing-amount bookkeeping exactly as before.
  const creditedAmountMap = new Map()
  historicTransactions.forEach((transaction) =>
    updateCreditedAmountMap(creditedAmountMap, transaction)
  )

  let wasteRecordTotal = 0

  for (const record of wasteRecords) {
    const targetAmount = getTargetAmount(record, accreditation, overseasSites)
    wasteRecordTotal = toNumber(add(wasteRecordTotal, targetAmount))

    const alreadyCreditedAmount =
      creditedAmountMap.get(String(record.rowId)) || 0

    const delta = subtract(targetAmount, alreadyCreditedAmount)

    if (!isZero(delta)) {
      const type = greaterThan(delta, 0)
        ? WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
        : WASTE_BALANCE_TRANSACTION_TYPE.DEBIT

      const transaction = buildTransaction(
        record,
        toNumber(abs(delta)),
        currentAmount,
        currentAvailableAmount,
        user,
        type
      )

      currentAmount = transaction.closingAmount
      currentAvailableAmount = transaction.closingAvailableAmount
      newTransactions.push(transaction)

      updateCreditedAmountMap(creditedAmountMap, transaction)
    }
  }

  // Balance totals come directly from the waste records and PRN transactions,
  // not from accumulated waste-record deltas. Waste-record transactions key
  // entities by naked rowId and silently lose data under rowId collisions
  // (PAE-1380); waste records are the authoritative source and are uniquely
  // keyed by (type, rowId). PRN transactions use prnId entity ids and are
  // collision-free, so their net adjustment is safe to pull from the ledger.
  const {
    amount: prnAmountAdjustment,
    availableAmount: prnAvailableAmountAdjustment
  } = sumPrnTransactionAdjustments(historicTransactions)

  return {
    newTransactions,
    newAmount: toNumber(add(wasteRecordTotal, prnAmountAdjustment)),
    newAvailableAmount: toNumber(
      add(wasteRecordTotal, prnAvailableAmountAdjustment)
    )
  }
}
