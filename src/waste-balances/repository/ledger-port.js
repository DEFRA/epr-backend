/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/**
 * Storage-level port for the waste balance event ledger.
 *
 * Surface is deliberately minimal: only primitives where two correct adapters
 * could meaningfully implement things differently (persistence, native conflict
 * signal translation). Domain logic — balance arithmetic, retry on
 * slot conflict — lives above the port in the waste balance service, not on
 * adapters.
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerPosition} LedgerPosition
 */

/**
 * @typedef {import('./ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * Names the ledger a failed append was addressing.
 *
 * @param {WasteBalanceLedgerId} ledgerId
 */
const describeLedger = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) =>
  `organisation ${organisationNumber} registration ${registrationNumber} accreditation ${accreditationNumber}`

/**
 * Raised by `appendEvents` when the slot a position addresses is already
 * occupied. Adapters translate their native conflict signal (MongoDB `E11000`,
 * in-memory occupancy check) into this typed error so callers can react
 * uniformly.
 */
export class LedgerSlotConflictError extends Error {
  /** @type {OrganisationNumber} */
  organisationNumber
  /** @type {RegistrationNumber} */
  registrationNumber
  /** @type {AccreditationNumber | null} */
  accreditationNumber
  /** @type {number} */
  slotNumber

  /**
   * @param {LedgerPosition} position
   */
  constructor(position) {
    super(
      `Ledger slot already occupied for ${describeLedger(position)} number ${position.number}`
    )
    this.name = 'LedgerSlotConflictError'
    this.organisationNumber = position.organisationNumber
    this.registrationNumber = position.registrationNumber
    this.accreditationNumber = position.accreditationNumber
    this.slotNumber = position.number
  }
}

/**
 * Raised by `appendEvents` when the event's `number` is not the next
 * sequential value for its ledger. The ledger is strictly append-only
 * with no gaps: event N requires event N-1 to exist (or N must be 1 for
 * an empty ledger).
 */
export class LedgerSequenceError extends Error {
  /** @type {OrganisationNumber} */
  organisationNumber
  /** @type {RegistrationNumber} */
  registrationNumber
  /** @type {AccreditationNumber | null} */
  accreditationNumber
  /** @type {number} */
  providedNumber
  /** @type {number} */
  expectedNumber

  /**
   * @param {LedgerPosition} position - The position the event claimed.
   * @param {number} expectedNumber - The only number the ledger would accept.
   */
  constructor(position, expectedNumber) {
    super(
      `Ledger sequence violation for ${describeLedger(position)}: expected number ${expectedNumber}, got ${position.number}`
    )
    this.name = 'LedgerSequenceError'
    this.organisationNumber = position.organisationNumber
    this.registrationNumber = position.registrationNumber
    this.accreditationNumber = position.accreditationNumber
    this.providedNumber = position.number
    this.expectedNumber = expectedNumber
  }
}

/**
 * @typedef {import('./ledger-schema.js').LedgerEventInsert} LedgerEventInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerEvent} LedgerEvent
 */

/**
 * One ledger partition's latest submitted summary log: its ledger, and the
 * `summaryLogId` carried by the highest-numbered `summary log submitted` event
 * in that partition.
 *
 * @typedef {Object} LatestSubmittedSummaryLogPerLedger
 * @property {WasteBalanceLedgerId} ledgerId
 * @property {SummaryLogFileId} summaryLogId
 */

/**
 * Every per-ledger read names its ledger with a complete `WasteBalanceLedgerId`,
 * and every adapter filters on all three of its numbers. A read that names a
 * registration or accreditation under the wrong organisation matches nothing.
 * The exception is `findLatestSubmittedSummaryLogPerLedger`, a cross-ledger
 * reporting query, which scans partitions rather than naming one.
 *
 * @typedef {Object} WasteBalanceLedgerRepository
 * @property {(ledgerId: WasteBalanceLedgerId) => Promise<LedgerEvent | null>} findLatestInLedger
 *   Return the highest-numbered event for the ledger, or `null`
 *   if none exist.
 * @property {(ledgerIds: WasteBalanceLedgerId[]) => Promise<LedgerEvent[]>} findLatestInLedgers
 *   Return the highest-numbered event of each named ledger that has events.
 *   Order is unspecified.
 * @property {(ledgerId: WasteBalanceLedgerId, kind: import('./ledger-schema.js').LedgerEventKind) => Promise<LedgerEvent | null>} findLatestInLedgerByKind
 *   Return the highest-numbered event of the given kind for the ledger,
 *   or `null` if none of that kind exist.
 * @property {(ledgerId: WasteBalanceLedgerId, prnId: string, afterNumber: number) => Promise<LedgerEvent[]>} findEventsByPrnIdAfter
 *   Return events referencing the given `prnId` in `payload.prnId` within
 *   the specified ledger, with `number > afterNumber`, ordered by
 *   `number` ascending.
 * @property {(ledgerId: WasteBalanceLedgerId) => Promise<LedgerEvent[]>} findAllInLedger
 *   Return all events for the given ledger, ordered by `number`
 *   ascending. Returns an empty array if the ledger has no events.
 * @property {() => Promise<LatestSubmittedSummaryLogPerLedger[]>} findLatestSubmittedSummaryLogPerLedger
 *   Return one entry per ledger partition that has at least one
 *   `summary log submitted` event: the partition's ledger and the `summaryLogId` of
 *   the highest-numbered such event in that partition. Registered-only
 *   partitions appear with `accreditationNumber: null`; partitions with no
 *   submitted summary log never appear. Order is unspecified.
 * @property {(ledgerId: WasteBalanceLedgerId) => Promise<number>} deleteAllInLedger
 *   Migration PAE-1382: delete all events for the given ledger.
 *   Returns the number of deleted events. No-op on empty ledger.
 * @property {(events: LedgerEventInsert[]) => Promise<LedgerEvent[]>} appendEvents
 *   Append a contiguous batch of events. Events must be numbered
 *   sequentially, and the first event's number must be `currentMax + 1`
 *   (or `1` if the ledger is empty). Throws `LedgerSlotConflictError` if
 *   the starting slot is already occupied, `LedgerSequenceError` on a gap or
 *   non-sequential numbering. Empty array is a no-op.
 *
 *   A single-event batch is fully concurrency-safe: the slot index admits one
 *   writer per slot and the loser appends nothing. A multi-event batch is not
 *   isolated — it is not rolled back as a unit, so a competing writer can leave
 *   the batch truncated to a committed prefix while the caller sees the slot
 *   conflict. The slot index still guarantees gap-free contiguity, so the
 *   surviving prefix folds consistently; what is lost is decision-atomicity
 *   across the batch. A command that emits more than one event must therefore
 *   tolerate a re-applied prefix on replay (idempotent or independent events).
 */

/**
 * @typedef {() => WasteBalanceLedgerRepository} WasteBalanceLedgerRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
