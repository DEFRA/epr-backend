/**
 * Waste balance for an accreditation - the resolved tonnage credits and debits.
 *
 * Balances live entirely in the event-sourced ledger (see
 * `repository/ledger-port.js`), keyed by the `WasteBalanceLedgerId` this type
 * names. A balance is read by resolving the latest event's closing balance;
 * `amount` (total: credits minus debits) and `availableAmount` (amount minus
 * pending debits) are that closing balance.
 *
 * `eventNumber` is the ledger position the balance was resolved from: the
 * `number` of the latest event. Callers thread it back as `expectedHead` on a
 * write so the slot index can reject a decision made against a head that has
 * since moved.
 *
 * `creditTotal` is the latest summary-log credit total folded from the ledger —
 * the base the next submission's delta is measured against. Zero when the
 * ledger has no submission yet.
 *
 * DECIMAL PRECISION: Amount fields use decimal.js arithmetic to avoid floating
 * point rounding errors, converting to/from JavaScript numbers at the ledger
 * boundary.
 *
 * @typedef {import('../repository/ledger-schema.js').WasteBalanceLedgerId & {
 *   amount: number,
 *   availableAmount: number,
 *   eventNumber: number,
 *   creditTotal: number
 * }} WasteBalance
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
