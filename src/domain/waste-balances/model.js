export const WASTE_BALANCE_TRANSACTION_TYPE = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit'
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
  PRN_CANCELLED: 'prn:cancelled',
  PRN_CANCELLED_POST_ISSUE: 'prn:cancelled_post_issue'
})

/**
 * @typedef {typeof WASTE_BALANCE_TRANSACTION_ENTITY_TYPE[keyof typeof WASTE_BALANCE_TRANSACTION_ENTITY_TYPE]} WasteBalanceTransactionEntityType
 */

/**
 * @typedef {Object} UserSummary
 * @property {string} id - User ID
 * @property {string} name - Name
 */

/**
 * @typedef {Object} WasteBalanceTransactionEntity
 * @property {string} id - Reference to WASTE-RECORD or PRN
 * @property {string} currentVersionId - Current version ID that contributed to this transaction
 * @property {string[]} previousVersionIds - All previous version IDs (for audit trail)
 * @property {WasteBalanceTransactionEntityType} type - Entity type
 */

/**
 * Transaction record in the waste balance history
 * NOTE: Transactions are immutable once created - they cannot be modified or deleted
 *
 * DECIMAL PRECISION: All amount fields are stored as MongoDB Decimal128 in the database
 * for exact decimal precision. In JavaScript code, arithmetic operations use decimal.js
 * to prevent floating point rounding errors. Values are converted to/from JavaScript
 * numbers at the repository boundary.
 *
 * @typedef {Object} WasteBalanceTransaction
 * @property {string} id
 * @property {WasteBalanceTransactionType} type - Transaction type
 * @property {string} createdAt - ISO8601 timestamp
 * @property {UserSummary} [createdBy] - User who created the transaction (may be undefined for system-generated transactions)
 * @property {number} amount - Transaction amount (stored as Decimal128, handled as Decimal in arithmetic)
 * @property {number} openingAmount - Balance before transaction (stored as Decimal128)
 * @property {number} closingAmount - Balance after transaction (stored as Decimal128)
 * @property {number} openingAvailableAmount - Available balance before transaction (stored as Decimal128)
 * @property {number} closingAvailableAmount - Available balance after transaction (stored as Decimal128)
 * @property {WasteBalanceTransactionEntity[]} entities - Related entities
 */

/**
 * Waste balance document - tracks waste tonnage credits and debits
 * NOTE: The document is mutable (uses optimistic locking via version field)
 * However, the transactions array is append-only - existing transactions are immutable
 *
 * DECIMAL PRECISION: Amount fields are stored as MongoDB Decimal128 for exact precision.
 * See WasteBalanceTransaction documentation for details on decimal handling.
 *
 * @typedef {Object} WasteBalance
 * @property {string} id - Balance ID
 * @property {string} organisationId - Organisation ID
 * @property {string} accreditationId - Accreditation ID (unique)
 * @property {number} schemaVersion - Schema version
 * @property {number} version - Document version for optimistic locking
 * @property {number} amount - Total balance (credits minus debits, stored as Decimal128)
 * @property {number} availableAmount - Available balance (amount minus pending debits, stored as Decimal128)
 * @property {WasteBalanceTransaction[]} transactions - Transaction history (append-only)
 */
