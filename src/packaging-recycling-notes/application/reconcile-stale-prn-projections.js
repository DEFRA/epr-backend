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
 * @typedef {Object} Deps
 * @property {import('mongodb').Collection} prnCollection
 * @property {PackagingRecyclingNotesRepository} prnRepository
 * @property {WasteBalanceService} service
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
 * Writes the folded projection back under the repository's version CAS and
 * watermark guard. The guard rejects a projection another writer has already
 * moved past — as a returned `null`, or a thrown conflict. Either way the drift
 * stands and the next run retries it, so both collapse to `stillDrifting`.
 *
 * @param {PackagingRecyclingNotesRepository} prnRepository
 * @param {PackagingRecyclingNote} prn
 * @param {PackagingRecyclingNote} projection
 * @returns {Promise<'repaired' | 'stillDrifting'>}
 */
const repair = async (prnRepository, prn, projection) => {
  try {
    const persisted = await prnRepository.persistProjection({
      projection,
      expectedVersion: prn.version
    })
    return persisted ? 'repaired' : 'stillDrifting'
  } catch {
    return 'stillDrifting'
  }
}

/**
 * Reconciles one PRN by id. Reads it point-wise, folds any events past its
 * watermark, and (unless dry-run) persists the correction. A PRN deleted since
 * the id snapshot reads as `vanished`; one with nothing unapplied as `current`.
 *
 * @param {import('mongodb').Document['_id']} id
 * @param {Deps} deps
 * @param {boolean} isDryRun
 * @returns {Promise<{ outcome: string, report?: DriftReport }>}
 */
const reconcileOne = async (
  id,
  { prnCollection, prnRepository, service },
  isDryRun
) => {
  const doc = await prnCollection.findOne({ _id: id })
  if (!doc) {
    return { outcome: 'vanished' }
  }

  const prn = toPrnRead(doc)
  const catchupEvents = await unappliedEventsFor(prn, service)
  if (catchupEvents.length === 0) {
    return { outcome: 'current' }
  }

  const projection = applyCatchupEventsToPrn(prn, catchupEvents)
  const report = buildReport(prn, catchupEvents, projection)

  if (isDryRun) {
    return { outcome: 'drifting', report }
  }
  return { outcome: await repair(prnRepository, prn, projection), report }
}

/**
 * Scans every PRN projection and detects the ones whose stored status lags
 * their ledger — the drift a dropped write-back leaves behind, which the
 * list/download read paths never fold away (ADR-0047).
 *
 * Read-only when `isDryRun`; otherwise it folds each drifting projection and
 * persists it under the repository's version CAS and watermark guard, so a lost
 * race is left for the next run rather than forced. A single unreadable document
 * or unmappable event fails only its own PRN (`failed`); the sweep carries on.
 *
 * @param {Deps} deps
 * @param {Object} options
 * @param {boolean} options.isDryRun
 */
export const reconcileStalePrnProjections = async (deps, { isDryRun }) => {
  const tally = {
    scanned: 0,
    drifting: 0,
    repaired: 0,
    stillDrifting: 0,
    failed: 0
  }
  /** @type {DriftReport[]} */
  const reports = []

  // Snapshot the ids, then read each PRN point-wise. A repair sweep issues a
  // ledger query and a write per PRN, so one streaming cursor held open across
  // all of them risks a server-side timeout mid-sweep. The scan spans every
  // organisation: drift is independent of the admin exclusion list, which only
  // filters reads.
  const ids = await deps.prnCollection
    .find({}, { projection: { _id: 1 } })
    .map((doc) => doc._id)
    .toArray()

  for (const id of ids) {
    try {
      const { outcome, report } = await reconcileOne(id, deps, isDryRun)
      if (outcome === 'vanished') {
        continue
      }
      tally.scanned += 1
      if (report) {
        reports.push(report)
        tally.drifting += 1
      }
      if (outcome === 'repaired') {
        tally.repaired += 1
      } else if (outcome === 'stillDrifting') {
        tally.stillDrifting += 1
      }
    } catch {
      tally.failed += 1
    }
  }

  return { ...tally, reports }
}
