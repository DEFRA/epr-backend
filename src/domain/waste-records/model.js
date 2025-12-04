export const WASTE_RECORD_TYPE = Object.freeze({
  RECEIVED: 'received',
  PROCESSED: 'processed',
  SENT_ON: 'sentOn',
  EXPORTED: 'exported'
})

/**
 * @typedef {typeof WASTE_RECORD_TYPE[keyof typeof WASTE_RECORD_TYPE]} WasteRecordType
 */

export const VERSION_STATUS = Object.freeze({
  CREATED: 'created',
  UPDATED: 'updated',
  PENDING: 'pending'
})

/**
 * @typedef {typeof VERSION_STATUS[keyof typeof VERSION_STATUS]} VersionStatus
 */

export const WASTE_BALANCE_TRANSACTION_TYPE = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
  PENDING_DEBIT: 'pending_debit'
})

/**
 * @typedef {typeof WASTE_BALANCE_TRANSACTION_TYPE[keyof typeof WASTE_BALANCE_TRANSACTION_TYPE]} WasteBalanceTransactionType
 */

export const WASTE_BALANCE_TRANSACTION_ENTITY_TYPE = Object.freeze({
  WASTE_RECORD_RECEIVED: 'waste_record:received',
  WASTE_RECORD_SENT_ON: 'waste_record:sent_on',
  WASTE_RECORD_EXPORTED: 'waste_record:exported',
  PRN_CREATED: 'prn:created',
  PRN_ISSUED: 'prn:issued',
  PRN_ACCEPTED: 'prn:accepted',
  PRN_CANCELLED: 'prn:cancelled'
})

/**
 * @typedef {typeof WASTE_BALANCE_TRANSACTION_ENTITY_TYPE[keyof typeof WASTE_BALANCE_TRANSACTION_ENTITY_TYPE]} WasteBalanceTransactionEntityType
 */

/**
 * @typedef {Object} SummaryLogReference
 * @property {string} id - Summary log ID
 * @property {string} uri - S3 object URI
 */

/**
 * @typedef {Object} WasteRecordVersion
 * @property {string} createdAt - ISO8601 timestamp
 * @property {VersionStatus} status
 * @property {SummaryLogReference} summaryLog - Reference to summary log that created this version
 * @property {Object} data - For 'created' status: all fields required for reporting. For 'updated'/'pending': only changed fields
 */

/**
 * @typedef {Object} WasteRecord
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} [accreditationId]
 * @property {string} rowId - The waste record row identifier
 * @property {WasteRecordType} type
 * @property {Object} data - Reporting fields only
 * @property {WasteRecordVersion[]} versions - Version history. createdAt/updatedAt derived from first/last version
 */

/**
 * @typedef {Object} UserSummary
 * @property {string} id - User ID
 * @property {string} name - User name
 * @property {string} email - User email
 */

/**
 * @typedef {Object} WasteBalanceTransactionEntity
 * @property {string} id - Reference to WASTE-RECORD or PRN
 * @property {WasteBalanceTransactionEntityType} type - Entity type
 */

/**
 * Transaction record in the waste balance history
 * NOTE: Transactions are immutable once created - they cannot be modified or deleted
 * @typedef {Object} WasteBalanceTransaction
 * @property {string} _id - Transaction ID
 * @property {WasteBalanceTransactionType} type - Transaction type
 * @property {string} createdAt - ISO8601 timestamp
 * @property {UserSummary} createdBy - User who created the transaction
 * @property {number} amount - Transaction amount
 * @property {number} openingAmount - Balance before transaction
 * @property {number} closingAmount - Balance after transaction
 * @property {number} openingAvailableAmount - Available balance before transaction
 * @property {number} closingAvailableAmount - Available balance after transaction
 * @property {WasteBalanceTransactionEntity[]} entities - Related entities
 */

/**
 * Waste balance document - tracks waste tonnage credits and debits
 * NOTE: The document is mutable (uses optimistic locking via version field)
 * However, the transactions array is append-only - existing transactions are immutable
 * @typedef {Object} WasteBalance
 * @property {string} _id - Balance ID
 * @property {string} organisationId - Organisation ID
 * @property {string} accreditationId - Accreditation ID (unique)
 * @property {number} schemaVersion - Schema version
 * @property {number} version - Document version for optimistic locking
 * @property {number} amount - Total balance (credits minus debits)
 * @property {number} availableAmount - Available balance (amount minus pending debits)
 * @property {WasteBalanceTransaction[]} transactions - Transaction history (append-only)
 */
