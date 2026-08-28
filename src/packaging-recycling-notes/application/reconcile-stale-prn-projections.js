import { applyCatchupEventsToPrn } from '#packaging-recycling-notes/domain/apply-catchup-events-to-prn.js'
import { validatePrnRead } from '#packaging-recycling-notes/repository/validation.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#packaging-recycling-notes/application/get-projected-prn.js').WasteBalanceService} WasteBalanceService
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 */

/**
 * @typedef {Object} DriftReport
 * @property {string} prnId
 * @property {string | null} prnNumber
 * @property {string} currentStatus - the status the stored projection carries
 * @property {number | undefined} lastAppliedEventNumber - the stored watermark
 * @property {number} unappliedCount - events past the watermark for this PRN
 * @property {number} minUnappliedNumber - the first unapplied event's slot
 * @property {string} wouldBecomeStatus - the status the fold would settle on
 */

/**
 * A stored document carries `_id`; readers name it by `id`. Mirror the
 * repository's read mapping so the fold and the CAS persist see the same shape.
 *
 * @param {*} doc
 * @returns {PackagingRecyclingNote}
 */
const toPrnRead = (doc) =>
  validatePrnRead({ ...doc, id: doc._id.toHexString() })

/**
 * @param {PackagingRecyclingNote} prn
 * @param {*[]} catchupEvents - ascending by slot number
 * @param {PackagingRecyclingNote} projection - the folded document
 * @returns {DriftReport}
 */
const buildReport = (prn, catchupEvents, projection) => ({
  prnId: prn.id,
  prnNumber: prn.prnNumber ?? null,
  currentStatus: prn.status.currentStatus,
  lastAppliedEventNumber: prn.lastAppliedEventNumber,
  unappliedCount: catchupEvents.length,
  minUnappliedNumber: catchupEvents[0].number,
  wouldBecomeStatus: projection.status.currentStatus
})

/**
 * The events a stored projection has yet to apply: everything on its PRN's
 * stream past the watermark it carries. A missing watermark reads as `0`.
 *
 * @param {PackagingRecyclingNote} prn
 * @param {WasteBalanceService} service
 */
const unappliedEventsFor = (prn, service) =>
  service.prnCatchupEvents({
    organisationId: prn.organisation.id,
    registrationId: prn.registrationId,
    accreditationId: prn.accreditation.id,
    prnId: prn.id,
    afterEventNumber: prn.lastAppliedEventNumber ?? 0
  })

/**
 * Scans every PRN projection and detects the ones whose stored status lags
 * their ledger — the drift a dropped write-back leaves behind, which the
 * list/download read paths never fold away (ADR-0047).
 *
 * Read-only when `isDryRun`; otherwise it folds each drifting projection and
 * persists it under the repository's version CAS and watermark guard, so a lost
 * race is left for the next run rather than forced.
 *
 * @param {Object} deps
 * @param {import('mongodb').Collection} deps.prnCollection
 * @param {PackagingRecyclingNotesRepository} deps.prnRepository
 * @param {WasteBalanceService} deps.service
 * @param {Object} options
 * @param {boolean} options.isDryRun
 */
export const reconcileStalePrnProjections = async (
  { prnCollection, prnRepository, service },
  { isDryRun }
) => {
  let scanned = 0
  let drifting = 0
  let repaired = 0
  let stillDrifting = 0
  /** @type {DriftReport[]} */
  const reports = []

  for await (const doc of prnCollection.find({})) {
    scanned += 1
    const prn = toPrnRead(doc)
    const catchupEvents = await unappliedEventsFor(prn, service)
    if (catchupEvents.length === 0) {
      continue
    }

    drifting += 1
    const projection = applyCatchupEventsToPrn(prn, catchupEvents)
    reports.push(buildReport(prn, catchupEvents, projection))

    if (isDryRun) {
      continue
    }

    // The version CAS and watermark guard reject a projection another writer
    // has already moved past — as a returned null, or a thrown conflict. Either
    // way the drift stands; the next run retries it. One loser must not abort
    // the sweep over the PRNs behind it.
    try {
      const persisted = await prnRepository.persistProjection({
        projection,
        expectedVersion: prn.version
      })
      if (persisted) {
        repaired += 1
      } else {
        stillDrifting += 1
      }
    } catch {
      stillDrifting += 1
    }
  }

  return { scanned, drifting, repaired, stillDrifting, reports }
}
