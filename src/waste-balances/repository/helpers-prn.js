import Boom from '@hapi/boom'

import { validateAccreditationId } from './validation.js'
import { appendToStream } from '../application/append-to-stream.js'
import { STREAM_EVENT_KIND } from './stream-schema.js'
import { randomUUID } from 'node:crypto'
import {
  WASTE_BALANCE_CANONICAL_SOURCE,
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '../domain/model.js'
import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

/**
 * Build a transaction for PRN creation that deducts from availableAmount only.
 * This "ringfences" the tonnage without affecting the total amount.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to deduct
 * @param {string} params.userId - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnCreationTransaction = ({
  prnId,
  tonnage,
  userId,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: userId, name: userId },
  amount: tonnage,
  openingAmount: currentBalance.amount,
  closingAmount: currentBalance.amount, // Total unchanged
  openingAvailableAmount: currentBalance.availableAmount,
  closingAvailableAmount: toNumber(
    subtract(currentBalance.availableAmount, tonnage)
  ), // Available deducted
  entities: [
    {
      id: prnId,
      currentVersionId: prnId,
      previousVersionIds: [],
      type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CREATED
    }
  ]
})

/**
 * Append a PRN event to the stream when the balance is on the stream path.
 *
 * @param {Object} params
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.streamRepository
 * @param {string} params.registrationId
 * @param {string} params.accreditationId
 * @param {string} params.organisationId
 * @param {string} params.prnId
 * @param {number} params.tonnage
 * @param {string} params.userId
 * @param {import('./stream-schema.js').StreamEventKind} params.streamKind
 * @returns {Promise<import('./stream-port.js').StreamEvent>} The appended event.
 */
const appendPrnStreamEvent = async ({
  streamRepository,
  registrationId,
  accreditationId,
  organisationId,
  prnId,
  tonnage,
  userId,
  streamKind
}) =>
  appendToStream(
    {
      repository: streamRepository,
      registrationId,
      accreditationId,
      organisationId
    },
    {
      kind: streamKind,
      payload: { prnId, amount: tonnage },
      createdBy: { id: userId, name: userId }
    }
  )

/**
 * Append a PRN stream event with no balance side-effect (PRN_ACCEPTED,
 * PRN_REJECTED). Ledger-only — throws on embedded balances and when no balance
 * exists. The dispatcher in update-status routes status-only kinds here on the
 * ledger path; if the marker is anything else, that's a contract violation we
 * surface rather than silently no-op.
 *
 * @param {Object} params
 * @param {Object} params.appendParams
 * @param {string} params.appendParams.accreditationId
 * @param {string} params.appendParams.registrationId
 * @param {string} params.appendParams.organisationId
 * @param {string} params.appendParams.prnId
 * @param {number} params.appendParams.tonnage
 * @param {string} params.appendParams.userId
 * @param {import('./stream-schema.js').StreamEventKind} params.appendParams.streamKind
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @returns {Promise<import('./stream-port.js').StreamEvent>}
 */
export const performAppendPrnStreamEvent = async ({
  appendParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId,
    streamKind
  } = appendParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (
    wasteBalance?.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER ||
    !dependencies?.streamRepository
  ) {
    throw Boom.badImplementation(
      `appendStreamEvent is ledger-only and requires a stream-backed balance (accreditation ${validatedAccreditationId})`
    )
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    userId,
    streamKind
  })
}

/**
 * Deduct available balance for PRN creation (ringfencing tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').DeductAvailableBalanceParams} params.deductParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @returns {Promise<import('./stream-port.js').StreamEvent|null>} The appended
 *   stream event on the ledger path, or `null` on the embedded path and when
 *   no balance exists.
 */
export const performDeductAvailableBalanceForPrnCreation = async ({
  deductParams,
  findBalance,
  saveBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    return null
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    return appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CREATED
    })
  }

  const transaction = buildPrnCreationTransaction({
    prnId,
    tonnage,
    userId,
    currentBalance: wasteBalance
  })

  const updatedBalance = {
    ...wasteBalance,
    availableAmount: transaction.closingAvailableAmount,
    transactions: [...(wasteBalance.transactions || []), transaction],
    version: (wasteBalance.version || 0) + 1
  }

  await saveBalance(updatedBalance, [transaction])

  return null
}

/**
 * Build a transaction for PRN issue that deducts from amount (total) only.
 * The availableAmount was already deducted when the PRN was created.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to deduct
 * @param {string} params.userId - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnIssuedTransaction = ({
  prnId,
  tonnage,
  userId,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: userId, name: userId },
  amount: tonnage,
  openingAmount: currentBalance.amount,
  closingAmount: toNumber(subtract(currentBalance.amount, tonnage)), // Total deducted
  openingAvailableAmount: currentBalance.availableAmount,
  closingAvailableAmount: currentBalance.availableAmount, // Available unchanged
  entities: [
    {
      id: prnId,
      currentVersionId: prnId,
      previousVersionIds: [],
      type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_ISSUED
    }
  ]
})

/**
 * Deduct total balance for PRN issue (finalising the deduction).
 *
 * @param {Object} params
 * @param {import('./port.js').DeductTotalBalanceParams} params.deductParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @returns {Promise<import('./stream-port.js').StreamEvent|null>} The appended
 *   stream event on the ledger path, or `null` on the embedded path and when
 *   no balance exists.
 */
export const performDeductTotalBalanceForPrnIssue = async ({
  deductParams,
  findBalance,
  saveBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    return null
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    return appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_ISSUED
    })
  }

  const transaction = buildPrnIssuedTransaction({
    prnId,
    tonnage,
    userId,
    currentBalance: wasteBalance
  })

  const updatedBalance = {
    ...wasteBalance,
    amount: transaction.closingAmount,
    transactions: [...(wasteBalance.transactions || []), transaction],
    version: (wasteBalance.version || 0) + 1
  }

  await saveBalance(updatedBalance, [transaction])

  return null
}

/**
 * Build a credit transaction for PRN cancellation that restores availableAmount.
 * Reverses the ringfencing that occurred when the PRN was created.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to restore
 * @param {string} params.userId - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnCancellationTransaction = ({
  prnId,
  tonnage,
  userId,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: userId, name: userId },
  amount: tonnage,
  openingAmount: currentBalance.amount,
  closingAmount: currentBalance.amount, // Total unchanged
  openingAvailableAmount: currentBalance.availableAmount,
  closingAvailableAmount: toNumber(
    add(currentBalance.availableAmount, tonnage)
  ), // Available restored
  entities: [
    {
      id: prnId,
      currentVersionId: prnId,
      previousVersionIds: [],
      type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED
    }
  ]
})

/**
 * Build a credit transaction for cancelling an issued PRN that restores both
 * amount and availableAmount. Reverses both the creation ringfence and the
 * issue deduction.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to restore
 * @param {string} params.userId - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildIssuedPrnCancellationTransaction = ({
  prnId,
  tonnage,
  userId,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: userId, name: userId },
  amount: tonnage,
  openingAmount: currentBalance.amount,
  closingAmount: toNumber(add(currentBalance.amount, tonnage)),
  openingAvailableAmount: currentBalance.availableAmount,
  closingAvailableAmount: toNumber(
    add(currentBalance.availableAmount, tonnage)
  ),
  entities: [
    {
      id: prnId,
      currentVersionId: prnId,
      previousVersionIds: [],
      type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED_POST_ISSUE
    }
  ]
})

/**
 * Credit both amount and available balance for issued PRN cancellation.
 * Reverses both the creation ringfence and the issue deduction.
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @returns {Promise<import('./stream-port.js').StreamEvent|null>} The appended
 *   stream event on the ledger path, or `null` on the embedded path. Throws
 *   when no balance exists.
 */
export const performCreditFullBalanceForIssuedPrnCancellation = async ({
  creditParams,
  findBalance,
  saveBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    return appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
    })
  }

  const transaction = buildIssuedPrnCancellationTransaction({
    prnId,
    tonnage,
    userId,
    currentBalance: wasteBalance
  })

  const updatedBalance = {
    ...wasteBalance,
    amount: transaction.closingAmount,
    availableAmount: transaction.closingAvailableAmount,
    transactions: [...(wasteBalance.transactions || []), transaction],
    version: (wasteBalance.version || 0) + 1
  }

  await saveBalance(updatedBalance, [transaction])

  return null
}

/**
 * Credit available balance for PRN cancellation (reversing the ringfenced tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @returns {Promise<import('./stream-port.js').StreamEvent|null>} The appended
 *   stream event on the ledger path, or `null` on the embedded path. Throws
 *   when no balance exists.
 */
export const performCreditAvailableBalanceForPrnCancellation = async ({
  creditParams,
  findBalance,
  saveBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    return appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED
    })
  }

  const transaction = buildPrnCancellationTransaction({
    prnId,
    tonnage,
    userId,
    currentBalance: wasteBalance
  })

  const updatedBalance = {
    ...wasteBalance,
    availableAmount: transaction.closingAvailableAmount,
    transactions: [...(wasteBalance.transactions || []), transaction],
    version: (wasteBalance.version || 0) + 1
  }

  await saveBalance(updatedBalance, [transaction])

  return null
}
