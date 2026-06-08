/**
 * Waste balance document - tracks waste tonnage credits and debits.
 *
 * The document carries identity, optimistic-locking version, and the latest
 * resolved balance amounts. Balance history lives in the event-sourced stream
 * (see `repository/stream-port.js`); the document's `amount` /
 * `availableAmount` are resolved from the stream's latest closing balance on
 * read.
 *
 * DECIMAL PRECISION: Amount fields are stored as MongoDB Decimal128 for exact
 * precision. In JavaScript code, arithmetic uses decimal.js to avoid floating
 * point rounding errors. Values convert to/from JavaScript numbers at the
 * repository boundary.
 *
 * @typedef {Object} WasteBalance
 * @property {string} id - Balance ID
 * @property {string} organisationId - Organisation ID
 * @property {string} accreditationId - Accreditation ID (unique)
 * @property {string} [registrationId] - Registration ID
 * @property {number} schemaVersion - Schema version
 * @property {number} version - Document version for optimistic locking
 * @property {number} amount - Total balance (credits minus debits, stored as Decimal128)
 * @property {number} availableAmount - Available balance (amount minus pending debits, stored as Decimal128)
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
