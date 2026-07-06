/**
 * Waste balance for an accreditation - the resolved tonnage credits and debits.
 *
 * Balances live entirely in the event-sourced ledger (see
 * `repository/ledger-port.js`), keyed by the `(registrationId,
 * accreditationId)` ledgerId. A balance is read by resolving the latest
 * event's closing balance; `amount` / `availableAmount` are that closing
 * balance.
 *
 * DECIMAL PRECISION: Amount fields use decimal.js arithmetic to avoid floating
 * point rounding errors, converting to/from JavaScript numbers at the ledger
 * boundary.
 *
 * @typedef {Object} WasteBalance
 * @property {string} organisationId - Organisation ID
 * @property {string} registrationId - Registration ID (part of the ledger identity)
 * @property {string | null} accreditationId - Accreditation ID (part of the ledger identity); `null` for a registered-only ledger.
 * @property {number} amount - Total balance (credits minus debits)
 * @property {number} availableAmount - Available balance (amount minus pending debits)
 * @property {number} eventNumber - Ledger position this balance was resolved
 *   from: the `number` of the latest event. Callers thread it back as
 *   `expectedHead` on a write so the slot index can reject a decision made
 *   against a head that has since moved.
 * @property {number} creditTotal - The latest summary-log credit total folded
 *   from the ledger — the base the next submission's delta is measured against.
 *   Zero when the ledger has no submission yet.
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
