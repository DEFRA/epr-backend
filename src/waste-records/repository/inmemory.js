import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { validateRowStateInsert } from './validation.js'

/**
 * In-memory adapter for waste record states.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
 */

/**
 * @typedef {import('./schema.js').RowState} RowState
 */

/**
 * @typedef {import('./schema.js').RowStateInsert} RowStateInsert
 */

/**
 * @typedef {import('./schema.js').RowStateEntry} RowStateEntry
 */

/**
 * @typedef {import('./schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @param {RowState} doc
 * @param {RowStateInsert} candidate
 */
const matchesRowIdentity = (doc, candidate) =>
  doc.organisationId === candidate.organisationId &&
  doc.registrationId === candidate.registrationId &&
  doc.accreditationId === candidate.accreditationId &&
  doc.rowId === candidate.rowId &&
  doc.wasteRecordType === candidate.wasteRecordType

/**
 * @param {RowState} doc
 * @param {RowStateInsert} candidate
 */
const matchesCommittedState = (doc, candidate) =>
  matchesRowIdentity(doc, candidate) &&
  isDeepStrictEqual(doc.data, candidate.data) &&
  isDeepStrictEqual(doc.classification, candidate.classification)

/**
 * @param {RowState[]} storage
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {RowStateEntry} entry
 * @param {string} summaryLogId
 * @returns {RowState}
 */
const upsertOne = (storage, ledgerId, entry, summaryLogId) => {
  const candidate = validateRowStateInsert({
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    accreditationId: ledgerId.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
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
 * @param {RowState[]} [initialRowStates]
 * @returns {import('./port.js').RowStateRepositoryFactory}
 */
export const createInMemoryRowStateRepository = (initialRowStates = []) => {
  const storage = initialRowStates

  return () => ({
    /**
     * @param {WasteBalanceLedgerId} ledgerId
     * @param {RowStateEntry[]} rowStates
     * @param {string} summaryLogId
     */
    upsertRowStates: async (ledgerId, rowStates, summaryLogId) =>
      rowStates.map((entry) =>
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
