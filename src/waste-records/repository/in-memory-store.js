import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { validateSummaryLogRowStateInsert } from './validation.js'

/**
 * In-memory implementation of the summary-log row state repository.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes. It also
 * backs the flag-off dry run of the discrepancy diagnostic: the reconstruction
 * sweep writes the estate into an instance of this store and the reconciliation
 * reads it back, so nothing is written to mongodb while the backfill flag is
 * off. Shipped in the production image for that path; the test-facing
 * `inmemory.js` re-exports it.
 *
 * The production use is a rollout-window mechanism only. Once the row-state
 * migration is complete — the estate backfilled and the write flag flipped —
 * the flag-off dry run is removed, and this store loses its production role and
 * becomes a test double again.
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateInsert} SummaryLogRowStateInsert
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateEntry} SummaryLogRowStateEntry
 */

/**
 * @typedef {import('./schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @param {SummaryLogRowState} doc
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesRowIdentity = (doc, candidate) =>
  doc.organisationId === candidate.organisationId &&
  doc.registrationId === candidate.registrationId &&
  doc.accreditationId === candidate.accreditationId &&
  doc.rowId === candidate.rowId &&
  doc.wasteRecordType === candidate.wasteRecordType

/**
 * @param {SummaryLogRowState} doc
 * @param {SummaryLogRowStateInsert} candidate
 */
const matchesCommittedState = (doc, candidate) =>
  matchesRowIdentity(doc, candidate) &&
  doc.processingType === candidate.processingType &&
  isDeepStrictEqual(doc.data, candidate.data) &&
  isDeepStrictEqual(doc.classification, candidate.classification)

/**
 * @param {SummaryLogRowState[]} storage
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {SummaryLogRowStateEntry} entry
 * @param {string} summaryLogId
 * @returns {SummaryLogRowState}
 */
const upsertOne = (storage, ledgerId, entry, summaryLogId) => {
  const candidate = validateSummaryLogRowStateInsert({
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    accreditationId: ledgerId.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
    processingType: entry.processingType,
    data: entry.data,
    classification: entry.classification,
    summaryLogIds: [summaryLogId]
  })

  const match = storage.find((doc) => matchesCommittedState(doc, candidate))

  if (match) {
    if (!match.summaryLogIds.includes(summaryLogId)) {
      match.summaryLogIds.push(summaryLogId)
    }
    return structuredClone(match)
  }

  const persisted = { id: randomUUID(), ...candidate }
  storage.push(persisted)
  return structuredClone(persisted)
}

/**
 * @param {SummaryLogRowState[]} [initialSummaryLogRowStates]
 * @returns {import('./port.js').SummaryLogRowStateRepositoryFactory}
 */
export const createInMemorySummaryLogRowStateRepository = (
  initialSummaryLogRowStates = []
) => {
  const storage = initialSummaryLogRowStates

  return () => ({
    /**
     * @param {WasteBalanceLedgerId} ledgerId
     * @param {SummaryLogRowStateEntry[]} summaryLogRowStates
     * @param {string} summaryLogId
     */
    upsertSummaryLogRowStates: async (
      ledgerId,
      summaryLogRowStates,
      summaryLogId
    ) =>
      summaryLogRowStates.map((entry) =>
        upsertOne(storage, ledgerId, entry, summaryLogId)
      ),

    /** @param {string} summaryLogId */
    findBySummaryLogId: async (summaryLogId) =>
      structuredClone(
        storage.filter((doc) => doc.summaryLogIds.includes(summaryLogId))
      ),

    /**
     * @param {string} organisationId
     * @param {string} registrationId
     * @param {string} rowId
     * @param {string} wasteRecordType
     */
    findRowHistory: async (
      organisationId,
      registrationId,
      rowId,
      wasteRecordType
    ) =>
      structuredClone(
        storage.filter(
          (doc) =>
            doc.organisationId === organisationId &&
            doc.registrationId === registrationId &&
            doc.rowId === rowId &&
            doc.wasteRecordType === wasteRecordType
        )
      )
  })
}
