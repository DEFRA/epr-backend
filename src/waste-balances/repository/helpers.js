import Boom from '@hapi/boom'
import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '../application/calculator.js'
import { recordWasteBalanceUpdateAudit } from '../application/audit.js'
import { performUpdateViaStream } from '../application/update-via-stream.js'
import { appendToStream } from '../application/append-to-stream.js'
import { STREAM_EVENT_KIND } from './stream-schema.js'
import { randomUUID } from 'node:crypto'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'

/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
import {
  WASTE_BALANCE_CANONICAL_SOURCE,
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '../domain/model.js'
import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

/**
 * Determines if a record should be included based on schema validation.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - The waste record
 * @returns {boolean} Whether the record passes validation
 */
const isRecordValid = (record) => {
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema) {
    return true
  }

  const { outcome } = classifyRow(record.data, schema)
  return outcome === ROW_OUTCOME.INCLUDED
}

/**
 * Create a new waste balance object.
 *
 * @param {string} accreditationId
 * @param {string} organisationId
 * @returns {import('../domain/model.js').WasteBalance}
 */
export const createNewWasteBalance = (accreditationId, organisationId) => ({
  id: randomUUID(),
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  transactions: [],
  version: 0,
  schemaVersion: 1,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
})

/**
 * Find an existing waste balance or create a new one if allowed.
 *
 * @param {Object} params
 * @param {(id: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {string} params.accreditationId
 * @param {string} [params.organisationId]
 * @param {boolean} params.shouldCreate
 * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
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

  if (!shouldCreate || !organisationId) {
    return null
  }

  return createNewWasteBalance(accreditationId, organisationId)
}

/**
 * Marks each waste record as excluded or included in the waste balance.
 * Excluded records are still passed to the calculator so that any existing
 * credits can be reversed via the delta mechanism.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
 */
export const markExcludedRecords = (wasteRecords) => {
  return wasteRecords.map((record) => ({
    ...record,
    excludedFromWasteBalance: !isRecordValid(record)
  }))
}

const calculateAndApplyUpdates = async (
  validRecords,
  validatedAccreditationId,
  accreditation,
  findBalance,
  user,
  overseasSites
) => {
  const wasteBalance = await findOrCreateWasteBalance({
    findBalance,
    accreditationId: validatedAccreditationId,
    organisationId: validRecords[0]?.organisationId,
    shouldCreate: true
  })

  if (!wasteBalance) {
    return null
  }

  const { newTransactions, newAmount, newAvailableAmount } =
    calculateWasteBalanceUpdates({
      currentBalance: wasteBalance,
      wasteRecords: validRecords,
      accreditation,
      user,
      overseasSites
    })

  if (newTransactions.length === 0) {
    return null
  }

  return {
    updatedBalance: {
      ...wasteBalance,
      amount: newAmount,
      availableAmount: newAvailableAmount,
      transactions: [...(wasteBalance.transactions || []), ...newTransactions],
      version: (wasteBalance.version || 0) + 1
    },
    newTransactions
  }
}

const dispatchToStream = async ({
  annotatedRecords,
  accreditation,
  validatedAccreditationId,
  dependencies,
  user,
  overseasSites,
  summaryLogId
}) => {
  await performUpdateViaStream({
    wasteRecords: annotatedRecords,
    accreditation: { ...accreditation, id: validatedAccreditationId },
    streamRepository:
      /** @type {import('./stream-port.js').StreamRepository} */ (
        dependencies.streamRepository
      ),
    dependencies: {
      systemLogsRepository: dependencies.systemLogsRepository
    },
    user: /** @type {import('#domain/summary-logs/worker/port.js').SubmitUser} */ (
      user
    ),
    overseasSites,
    summaryLogId: /** @type {string} */ (summaryLogId)
  })
}

/**
 * Shared logic for updating waste balance transactions.
 *
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker:
 * - flag OFF — embedded `transactions[]` array
 * - flag ON, marker `'ledger'` — event stream path
 * - flag ON, marker `'ledger'` (legacy ledger) — ledger-append path (ADR 0031)
 * - flag ON, marker `'embedded'`, `'migrating'`, or no balance yet — embedded
 *   `transactions[]` array
 *
 * `'migrating'` deliberately routes to the embedded path: a per-accreditation
 * rebuild that flipped the marker via `flipCanonicalSourceToMigrating` keeps
 * the embedded write path live for PRN operations during the replay window —
 * the version-conditional `flipCanonicalSourceToLedger` catches concurrent
 * writes and forces a retry. Summary-log submissions are kept off this path
 * during the migrating window by `transitionToSubmittingExclusive`'s 409
 * exclusion, so the only writes that legitimately reach this dispatch under
 * `'migrating'` are PRN operations.
 *
 * The marker drives per-accreditation rollout: a freshly enabled environment
 * keeps every accreditation on the embedded array until a rebuild replays
 * authoritative history into the stream and flips the marker. Both paths
 * preserve audit emission.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[] | any[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {Object} params.dependencies
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('../repository/ledger-port.js').LedgerRepository} [params.dependencies.ledgerRepository]
 * @param {import('../repository/stream-port.js').StreamRepository} [params.dependencies.streamRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[], user?: any) => Promise<void>} params.saveBalance
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} [params.user]
 * @param {OverseasSitesContext} params.overseasSites - Resolved ORS lookup map or ORS_VALIDATION_DISABLED
 * @param {string} [params.summaryLogId]
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditation,
  dependencies,
  findBalance,
  saveBalance,
  user,
  overseasSites,
  summaryLogId
}) => {
  const annotatedRecords = markExcludedRecords(wasteRecords)

  if (annotatedRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditation.id)

  if (dependencies.featureFlags?.isWasteBalanceLedgerEnabled()) {
    const existingBalance = await findBalance(validatedAccreditationId)
    if (
      existingBalance?.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
    ) {
      await dispatchToStream({
        annotatedRecords,
        accreditation,
        validatedAccreditationId,
        dependencies,
        user,
        overseasSites,
        summaryLogId
      })
      return
    }
  }

  const result = await calculateAndApplyUpdates(
    annotatedRecords,
    validatedAccreditationId,
    accreditation,
    findBalance,
    user,
    overseasSites
  )

  if (!result) {
    return
  }

  const { updatedBalance, newTransactions } = result

  await saveBalance(updatedBalance, newTransactions)

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: updatedBalance.accreditationId,
    amount: updatedBalance.amount,
    availableAmount: updatedBalance.availableAmount,
    newTransactions,
    user: /** @type {import('#domain/summary-logs/worker/port.js').SubmitUser} */ (
      user
    )
  })
}

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
 * @param {import('../repository/stream-port.js').StreamRepository} params.streamRepository
 * @param {string} params.registrationId
 * @param {string} params.accreditationId
 * @param {string} params.organisationId
 * @param {string} params.prnId
 * @param {number} params.tonnage
 * @param {string} params.userId
 * @param {import('./stream-schema.js').StreamEventKind} params.streamKind
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
}) => {
  await appendToStream(
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
}

/**
 * Deduct available balance for PRN creation (ringfencing tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').DeductAvailableBalanceParams} params.deductParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').StreamRepository} [params.dependencies.streamRepository]
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
    return
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    await appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CREATED
    })
    return
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
 * @param {import('./stream-port.js').StreamRepository} [params.dependencies.streamRepository]
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
    return
  }

  if (
    wasteBalance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER &&
    dependencies?.streamRepository
  ) {
    await appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_ISSUED
    })
    return
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
 * @param {import('./stream-port.js').StreamRepository} [params.dependencies.streamRepository]
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
    await appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
    })
    return
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
}

/**
 * Credit available balance for PRN cancellation (reversing the ringfenced tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 * @param {Object} [params.dependencies]
 * @param {import('./stream-port.js').StreamRepository} [params.dependencies.streamRepository]
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
    await appendPrnStreamEvent({
      streamRepository: dependencies.streamRepository,
      registrationId,
      accreditationId: validatedAccreditationId,
      organisationId,
      prnId,
      tonnage,
      userId,
      streamKind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED
    })
    return
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
}
