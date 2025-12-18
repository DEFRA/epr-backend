import { validateAccreditationId } from './validation.js'
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

const getTableName = (recordType, processingType) => {
  if (processingType === PROCESSING_TYPES.EXPORTER) {
    if (recordType === WASTE_RECORD_TYPE.EXPORTED) {
      return TABLE_NAMES.RECEIVED_LOADS_FOR_EXPORT
    }
    if (recordType === WASTE_RECORD_TYPE.SENT_ON) {
      return TABLE_NAMES.SENT_ON_LOADS
    }
  }
  return null
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

  if (!shouldCreate) {
    return null
  }

  return createNewWasteBalance(accreditationId, organisationId)
}

/**
 * Filters waste records to include only those that pass validation.
 * Reads processingType from the first record's data.processingType.
 *
 * @param {Array<{record: import('#domain/waste-records/model.js').WasteRecord, outcome?: string}>} wasteRecords
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
 */
export const filterValidRecords = (wasteRecords) => {
  if (wasteRecords.length === 0) {
    return []
  }

  // Get processingType from the first record - all records in a batch share the same type
  const firstRecord = wasteRecords[0].record || wasteRecords[0]
  const processingType = firstRecord.data?.processingType

  const getTableSchema = processingType
    ? createTableSchemaGetter(processingType, PROCESSING_TYPE_TABLES)
    : null

  const validRecords = []

  for (const record of wasteRecords) {
    // Handle wrapped record { record, outcome } for backward compat if needed
    const actualRecord = record.record || record
    const recordProcessingType =
      actualRecord.data?.processingType || processingType
    let isIncluded = true

    if (getTableSchema) {
      const tableName = getTableName(actualRecord.type, recordProcessingType)
      const schema = tableName ? getTableSchema(tableName) : null

      if (schema) {
        const { outcome } = classifyRow(actualRecord.data, schema)
        if (outcome !== ROW_OUTCOME.INCLUDED) {
          isIncluded = false
        }
      }
    } else if (record.outcome) {
      // Fallback to pre-calculated outcome if processingType not available
      if (record.outcome !== ROW_OUTCOME.INCLUDED) {
        isIncluded = false
      }
    }

    if (isIncluded) {
      validRecords.push(actualRecord)
    }
  }

  return validRecords
}

/**
 * Shared logic for updating waste balance transactions.
 *
 * @param {Object} params
 * @param {Array<{record: import('#domain/waste-records/model.js').WasteRecord, outcome?: string}>} params.wasteRecords
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
  const validRecords = filterValidRecords(wasteRecords)

  if (validRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const { organisationsRepository } = dependencies
  if (!organisationsRepository) {
    throw new Error('organisationsRepository dependency is required')
  }

  const accreditation = await organisationsRepository.findAccreditationById(
    validRecords[0]?.organisationId,
    validatedAccreditationId
  )
  if (!accreditation) {
    throw new Error(`Accreditation not found: ${validatedAccreditationId}`)
  }

  const wasteBalance = await findOrCreateWasteBalance({
    findBalance,
    accreditationId: validatedAccreditationId,
    organisationId: validRecords[0]?.organisationId,
    shouldCreate: validRecords.length > 0
  })

  /* c8 ignore next 3 */
  if (!wasteBalance) {
    return
  }

  const { newTransactions, newAmount, newAvailableAmount } =
    calculateWasteBalanceUpdates({
      currentBalance: wasteBalance,
      wasteRecords: validRecords,
      accreditation
    })

  if (newTransactions.length === 0) {
    return
  }

  const updatedBalance = {
    ...wasteBalance,
    amount: newAmount,
    availableAmount: newAvailableAmount,
    transactions: [...(wasteBalance.transactions || []), ...newTransactions],
    version: (wasteBalance.version || 0) + 1
  }

  await saveBalance(updatedBalance, newTransactions)
}
