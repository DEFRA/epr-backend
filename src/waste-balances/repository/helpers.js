import Boom from '@hapi/boom'
import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '../application/calculator.js'
import { recordWasteBalanceUpdateAudit } from '../application/audit.js'
import { performUpdateViaLedger } from '../application/update-via-ledger.js'
import { appendPrnOperationToLedger } from '../application/append-prn-operation-to-ledger.js'
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
import { LEDGER_PRN_OPERATION_TYPE } from './ledger-schema.js'
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

/**
 * Shared logic for updating waste balance transactions.
 *
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker:
 * - flag OFF — embedded `transactions[]` array
 * - flag ON, marker `'ledger'` — ledger-append path (ADR 0031)
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
 * authoritative history into the ledger and flips the marker. Both paths
 * preserve audit emission.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {Object} params.dependencies
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('../repository/ledger-port.js').LedgerRepository} [params.dependencies.ledgerRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[], user?: any) => Promise<void>} params.saveBalance
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} params.user
 * @param {OverseasSitesContext} params.overseasSites - Resolved ORS lookup map or ORS_VALIDATION_DISABLED
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditation,
  dependencies,
  findBalance,
  saveBalance,
  user,
  overseasSites
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
      await performUpdateViaLedger({
        wasteRecords: annotatedRecords,
        accreditation: { ...accreditation, id: validatedAccreditationId },
        ledgerRepository:
          /** @type {import('./ledger-port.js').LedgerRepository} */ (
            dependencies.ledgerRepository
          ),
        dependencies: {
          systemLogsRepository: dependencies.systemLogsRepository
        },
        user,
        overseasSites
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
    user
  })
}

/**
 * Returns true if the v2 ledger path should handle this PRN operation. Loads
 * the balance once, dispatches when the global flag is ON and the
 * accreditation's `canonicalSource` marker is `'ledger'`, and emits the audit
 * event after the append. Callers handle the v1 embedded-array path when this
 * returns false.
 *
 * `'embedded'` and `'migrating'` markers always fall through to v1 — PRN
 * writes during a per-accreditation rebuild deliberately stay on the embedded
 * array so the rebuild's version-conditional flip can detect them and retry.
 *
 * @param {Object} params
 * @param {Object} params.dependencies
 * @param {import('./ledger-port.js').LedgerRepository} params.dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {import('../domain/model.js').WasteBalance} params.wasteBalance
 * @param {Object} params.prnParams
 * @param {string} params.prnParams.accreditationId
 * @param {string} params.prnParams.organisationId
 * @param {string} params.prnParams.registrationId
 * @param {string} params.prnParams.prnId
 * @param {number} params.prnParams.tonnage
 * @param {{ id: string, email: string }} params.prnParams.user
 * @param {import('./ledger-schema.js').LedgerPrnOperationType} params.operationType
 * @returns {Promise<boolean>}
 */
const tryDispatchPrnToLedger = async ({
  dependencies,
  wasteBalance,
  prnParams,
  operationType
}) => {
  if (!dependencies.featureFlags?.isWasteBalanceLedgerEnabled()) {
    return false
  }
  if (wasteBalance.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    return false
  }

  await appendPrnOperationToLedger({
    ledgerRepository: dependencies.ledgerRepository,
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: wasteBalance.accreditationId,
    organisationId: prnParams.organisationId,
    registrationId: prnParams.registrationId,
    prnId: prnParams.prnId,
    operationType,
    tonnage: prnParams.tonnage,
    user: prnParams.user
  })
  return true
}

/**
 * Build a transaction for PRN creation that deducts from availableAmount only.
 * This "ringfences" the tonnage without affecting the total amount.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to deduct
 * @param {{ id: string, email: string }} params.user - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnCreationTransaction = ({
  prnId,
  tonnage,
  user,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: user.id, name: user.email },
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
 * Deduct available balance for PRN creation (ringfencing tonnage).
 *
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker per the table in
 * `performUpdateWasteBalanceTransactions`. Flag-on `'ledger'` accreditations
 * append a `prn-operation` ledger transaction and bypass the embedded
 * `transactions[]` array; every other state stays on the embedded path.
 *
 * @param {Object} params
 * @param {import('./port.js').DeductAvailableBalanceParams} params.deductParams
 * @param {Object} params.dependencies
 * @param {import('./ledger-port.js').LedgerRepository} params.dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performDeductAvailableBalanceForPrnCreation = async ({
  deductParams,
  dependencies,
  findBalance,
  saveBalance
}) => {
  const {
    accreditationId,
    organisationId,
    registrationId,
    prnId,
    tonnage,
    user
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    return
  }

  const dispatchedToLedger = await tryDispatchPrnToLedger({
    dependencies,
    wasteBalance,
    prnParams: {
      accreditationId: validatedAccreditationId,
      organisationId,
      registrationId,
      prnId,
      tonnage,
      user
    },
    operationType: LEDGER_PRN_OPERATION_TYPE.CREATED
  })
  if (dispatchedToLedger) {
    return
  }

  const transaction = buildPrnCreationTransaction({
    prnId,
    tonnage,
    user,
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
 * @param {{ id: string, email: string }} params.user - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnIssuedTransaction = ({
  prnId,
  tonnage,
  user,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: user.id, name: user.email },
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
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker. Flag-on `'ledger'` accreditations
 * append a `prn-operation` ledger transaction; every other state stays on the
 * embedded path.
 *
 * @param {Object} params
 * @param {import('./port.js').DeductTotalBalanceParams} params.deductParams
 * @param {Object} params.dependencies
 * @param {import('./ledger-port.js').LedgerRepository} params.dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performDeductTotalBalanceForPrnIssue = async ({
  deductParams,
  dependencies,
  findBalance,
  saveBalance
}) => {
  const {
    accreditationId,
    organisationId,
    registrationId,
    prnId,
    tonnage,
    user
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    return
  }

  const dispatchedToLedger = await tryDispatchPrnToLedger({
    dependencies,
    wasteBalance,
    prnParams: {
      accreditationId: validatedAccreditationId,
      organisationId,
      registrationId,
      prnId,
      tonnage,
      user
    },
    operationType: LEDGER_PRN_OPERATION_TYPE.ISSUED
  })
  if (dispatchedToLedger) {
    return
  }

  const transaction = buildPrnIssuedTransaction({
    prnId,
    tonnage,
    user,
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
 * @param {{ id: string, email: string }} params.user - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildPrnCancellationTransaction = ({
  prnId,
  tonnage,
  user,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: user.id, name: user.email },
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
 * @param {{ id: string, email: string }} params.user - User performing the action
 * @param {import('../domain/model.js').WasteBalance} params.currentBalance
 * @returns {import('../domain/model.js').WasteBalanceTransaction}
 */
export const buildIssuedPrnCancellationTransaction = ({
  prnId,
  tonnage,
  user,
  currentBalance
}) => ({
  id: randomUUID(),
  type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
  createdAt: new Date().toISOString(),
  createdBy: { id: user.id, name: user.email },
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
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker. Flag-on `'ledger'` accreditations
 * append a `prn-operation` ledger transaction; every other state stays on the
 * embedded path.
 *
 * @param {Object} params
 * @param {import('./port.js').CreditFullBalanceParams} params.creditParams
 * @param {Object} params.dependencies
 * @param {import('./ledger-port.js').LedgerRepository} params.dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performCreditFullBalanceForIssuedPrnCancellation = async ({
  creditParams,
  dependencies,
  findBalance,
  saveBalance
}) => {
  const {
    accreditationId,
    organisationId,
    registrationId,
    prnId,
    tonnage,
    user
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  const dispatchedToLedger = await tryDispatchPrnToLedger({
    dependencies,
    wasteBalance,
    prnParams: {
      accreditationId: validatedAccreditationId,
      organisationId,
      registrationId,
      prnId,
      tonnage,
      user
    },
    operationType: LEDGER_PRN_OPERATION_TYPE.ISSUED_CANCELLED
  })
  if (dispatchedToLedger) {
    return
  }

  const transaction = buildIssuedPrnCancellationTransaction({
    prnId,
    tonnage,
    user,
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
 * Dispatches on the `wasteBalanceLedger` feature flag and the
 * per-accreditation `canonicalSource` marker. Flag-on `'ledger'` accreditations
 * append a `prn-operation` ledger transaction; every other state stays on the
 * embedded path.
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {Object} params.dependencies
 * @param {import('./ledger-port.js').LedgerRepository} params.dependencies.ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performCreditAvailableBalanceForPrnCancellation = async ({
  creditParams,
  dependencies,
  findBalance,
  saveBalance
}) => {
  const {
    accreditationId,
    organisationId,
    registrationId,
    prnId,
    tonnage,
    user
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  const dispatchedToLedger = await tryDispatchPrnToLedger({
    dependencies,
    wasteBalance,
    prnParams: {
      accreditationId: validatedAccreditationId,
      organisationId,
      registrationId,
      prnId,
      tonnage,
      user
    },
    operationType: LEDGER_PRN_OPERATION_TYPE.CANCELLED
  })
  if (dispatchedToLedger) {
    return
  }

  const transaction = buildPrnCancellationTransaction({
    prnId,
    tonnage,
    user,
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
