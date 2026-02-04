import Boom from '@hapi/boom'
import { validateAccreditationId } from './validation.js'
import { audit } from '@defra/cdp-auditing'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'
import { randomUUID } from 'node:crypto'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  createTableSchemaGetter,
  PROCESSING_TYPE_TABLES,
  TABLE_NAMES
} from '#domain/summary-logs/table-schemas/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'

const getTableName = (recordType, processingType) => {
  if (processingType === PROCESSING_TYPES.EXPORTER) {
    if (recordType === WASTE_RECORD_TYPE.EXPORTED) {
      return TABLE_NAMES.RECEIVED_LOADS_FOR_EXPORT
    }
    if (recordType === WASTE_RECORD_TYPE.SENT_ON) {
      return TABLE_NAMES.SENT_ON_LOADS
    }
  }

  if (processingType === PROCESSING_TYPES.REPROCESSOR_INPUT) {
    if (recordType === WASTE_RECORD_TYPE.RECEIVED) {
      return TABLE_NAMES.RECEIVED_LOADS_FOR_REPROCESSING
    }
    if (recordType === WASTE_RECORD_TYPE.SENT_ON) {
      return TABLE_NAMES.SENT_ON_LOADS
    }
  }

  if (processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
    if (recordType === WASTE_RECORD_TYPE.PROCESSED) {
      return TABLE_NAMES.REPROCESSED_LOADS
    }
    if (recordType === WASTE_RECORD_TYPE.SENT_ON) {
      return TABLE_NAMES.SENT_ON_LOADS
    }
  }

  return null
}

/**
 * Determines if a record should be included based on schema validation.
 *
 * @param {Object} actualRecord - The waste record to validate
 * @param {string} processingType - The processing type for schema lookup
 * @param {Function} getTableSchema - Function to get table schema
 * @returns {boolean} Whether the record passes validation
 */
const isRecordValidBySchema = (
  actualRecord,
  processingType,
  getTableSchema
) => {
  const tableName = getTableName(actualRecord.type, processingType)
  const schema = tableName ? getTableSchema(tableName) : null

  if (!schema) {
    return true
  }

  const { outcome } = classifyRow(actualRecord.data, schema)
  return outcome === ROW_OUTCOME.INCLUDED
}

/**
 * Determines if a single record should be included in the valid records list.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - The waste record
 * @param {Function|null} getTableSchema - Function to get table schema, or null
 * @returns {boolean}
 */
const isRecordValid = (record, getTableSchema) => {
  if (!getTableSchema) {
    return true
  }

  return isRecordValidBySchema(
    record,
    record.data?.processingType,
    getTableSchema
  )
}

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

  if (!shouldCreate || !organisationId) {
    return null
  }

  return createNewWasteBalance(accreditationId, organisationId)
}

/**
 * Filters waste records to include only those that pass schema validation.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
 */
export const filterValidRecords = (wasteRecords) => {
  const processingType = wasteRecords[0]?.data?.processingType

  const getTableSchema = processingType
    ? createTableSchemaGetter(processingType, PROCESSING_TYPE_TABLES)
    : null

  return wasteRecords.filter((record) => isRecordValid(record, getTableSchema))
}

const getAccreditation = async (
  organisationsRepository,
  organisationId,
  accreditationId
) => {
  if (!organisationsRepository) {
    throw new Error('organisationsRepository dependency is required')
  }

  const accreditation = await organisationsRepository.findAccreditationById(
    organisationId,
    accreditationId
  )

  if (!accreditation) {
    throw new Error(`Accreditation not found: ${accreditationId}`)
  }

  return accreditation
}

const recordAuditLogs = async (
  dependencies,
  updatedBalance,
  newTransactions,
  user
) => {
  if (!user?.id && !user?.email) {
    return
  }

  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    },
    context: {
      accreditationId: updatedBalance.accreditationId,
      amount: updatedBalance.amount,
      availableAmount: updatedBalance.availableAmount,
      newTransactions
    },
    user
  }

  audit(payload)

  if (dependencies.systemLogsRepository) {
    await dependencies.systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: user,
      event: payload.event,
      context: payload.context
    })
  }
}

const calculateAndApplyUpdates = async (
  dependencies,
  validRecords,
  validatedAccreditationId,
  findBalance
) => {
  const accreditation = await getAccreditation(
    dependencies.organisationsRepository,
    validRecords[0]?.organisationId,
    validatedAccreditationId
  )

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
      accreditation
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
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {string} params.accreditationId
 * @param {Object} params.dependencies
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} [params.dependencies.organisationsRepository]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[], user?: any) => Promise<void>} params.saveBalance
 * @param {any} [params.user]
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditationId,
  dependencies,
  findBalance,
  saveBalance,
  user
}) => {
  const validRecords = filterValidRecords(wasteRecords)

  if (validRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const result = await calculateAndApplyUpdates(
    dependencies,
    validRecords,
    validatedAccreditationId,
    findBalance
  )

  if (!result) {
    return
  }

  const { updatedBalance, newTransactions } = result

  await saveBalance(updatedBalance, newTransactions)

  await recordAuditLogs(dependencies, updatedBalance, newTransactions, user)
}

/**
 * Build a transaction for PRN creation that deducts from availableAmount only.
 * This "ringfences" the tonnage without affecting the total amount.
 *
 * @param {Object} params
 * @param {string} params.prnId - PRN identifier
 * @param {number} params.tonnage - Tonnage to deduct
 * @param {string} params.userId - User performing the action
 * @param {import('#domain/waste-balances/model.js').WasteBalance} params.currentBalance
 * @returns {import('#domain/waste-balances/model.js').WasteBalanceTransaction}
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
  closingAvailableAmount: currentBalance.availableAmount - tonnage, // Available deducted
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
 * @param {Object} params
 * @param {import('./port.js').DeductAvailableBalanceParams} params.deductParams
 * @param {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performDeductAvailableBalanceForPrnCreation = async ({
  deductParams,
  findBalance,
  saveBalance
}) => {
  const { accreditationId, prnId, tonnage, userId } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
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
 * @param {import('#domain/waste-balances/model.js').WasteBalance} params.currentBalance
 * @returns {import('#domain/waste-balances/model.js').WasteBalanceTransaction}
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
  closingAmount: currentBalance.amount - tonnage, // Total deducted
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
 * @param {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performDeductTotalBalanceForPrnIssue = async ({
  deductParams,
  findBalance,
  saveBalance
}) => {
  const { accreditationId, prnId, tonnage, userId } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
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
 * @param {import('#domain/waste-balances/model.js').WasteBalance} params.currentBalance
 * @returns {import('#domain/waste-balances/model.js').WasteBalanceTransaction}
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
  closingAvailableAmount: currentBalance.availableAmount + tonnage, // Available restored
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
 * Credit available balance for PRN cancellation (reversing the ringfenced tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(accreditationId: string) => Promise<import('#domain/waste-balances/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('#domain/waste-balances/model.js').WasteBalance, newTransactions: any[]) => Promise<void>} params.saveBalance
 */
export const performCreditAvailableBalanceForPrnCancellation = async ({
  creditParams,
  findBalance,
  saveBalance
}) => {
  const { accreditationId, prnId, tonnage, userId } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance(validatedAccreditationId)

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
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
