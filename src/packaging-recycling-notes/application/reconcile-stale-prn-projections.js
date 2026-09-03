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
 * @property {() => Promise<{ total: number, driftingIds: import('mongodb').ObjectId[] }>} findDrifting
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
 * Runs a repository write and maps its result to a repair outcome. A `null`
 * return (the PRN was deleted after detection) and a Boom rejection (a version
 * conflict or watermark regression the repository has already logged) both mean
 * the drift stands for the next run, so both collapse to `stillDrifting`. Any
 * other error is unexpected and unlogged, so it propagates to be surfaced as a
 * failure.
 *
 * @param {() => Promise<PackagingRecyclingNote | null>} write
 * @returns {Promise<'repaired' | 'stillDrifting'>}
 */
const persistOutcome = async (write) => {
  try {
    const persisted = await write()
    return persisted ? 'repaired' : 'stillDrifting'
  } catch (err) {
    if (/** @type {*} */ (err)?.isBoom) {
      return 'stillDrifting'
    }
    throw err
  }
}

/**
 * Repairs status-changing drift by persisting the full fold under the version
 * CAS and watermark guard: the stored status is wrong, so the whole projection
 * is rewritten.
 *
 * @param {PackagingRecyclingNotesRepository} prnRepository
 * @param {PackagingRecyclingNote} prn
 * @param {PackagingRecyclingNote} projection
 * @returns {Promise<'repaired' | 'stillDrifting'>}
 */
const repair = (prnRepository, prn, projection) =>
  persistOutcome(() =>
    prnRepository.persistProjection({
      projection,
      expectedVersion: prn.version
    })
  )

/**
 * Retires benign drift by stamping only the watermark the fold settled on,
 * under the same CAS and guard. The stored status already matches the fold, so
 * writing the full projection would churn `updatedAt` and duplicate the history
 * for no gain; advancing the watermark alone brings the PRN current and leaves
 * the sweep for good.
 *
 * @param {PackagingRecyclingNotesRepository} prnRepository
 * @param {PackagingRecyclingNote} prn
 * @param {PackagingRecyclingNote} projection
 * @returns {Promise<'repaired' | 'stillDrifting'>}
 */
const stampWatermark = (prnRepository, prn, projection) =>
  persistOutcome(() =>
    prnRepository.updateWatermark({
      id: prn.id,
      version: prn.version,
      lastAppliedEventNumber: /** @type {number} */ (
        projection.lastAppliedEventNumber
      )
    })
  )

/**
 * Reconciles one PRN by id. Reads it point-wise, folds any events past its
 * watermark, and (unless dry-run) persists the correction. A PRN deleted since
 * the id snapshot reads as `vanished`; one with nothing unapplied as `current`.
 *
 * @param {import('mongodb').Document['_id']} id
 * @param {Deps} deps
 * @param {boolean} isDryRun
 * @returns {Promise<{ outcome: string, report?: DriftReport, repairKind?: 'fold' | 'watermark' }>}
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

  // Status-changing drift (the frozen minority) is repaired by the full fold;
  // benign watermark-behind drift (status already correct) is retired by a
  // watermark-only stamp, so its history and audit fields are left untouched.
  // The kind is reported so the two populations stay legible in the summary.
  const statusUnchanged =
    projection.status.currentStatus === prn.status.currentStatus
  const repairKind = statusUnchanged ? 'watermark' : 'fold'
  const outcome = await (statusUnchanged
    ? stampWatermark(prnRepository, prn, projection)
    : repair(prnRepository, prn, projection))
  return { outcome, report, repairKind }
}

/**
 * Reconciles the PRN projections whose stored status lags their ledger — the
 * drift a dropped write-back leaves behind, which the list/download read paths
 * never fold away (ADR-0047).
 *
 * Detection is delegated to `findDrifting`, a single indexed query returning the
 * ids behind their ledger (and the collection `total` for the summary); the tail
 * is then re-read per PRN through the validated catch-up path in `reconcileOne`,
 * so only the affected PRNs are folded. Read-only when `isDryRun`; otherwise it
 * persists each fold under the repository's version CAS and watermark guard, so
 * a lost race is left for the next run rather than forced. A PRN deleted or
 * healed between detection and its re-read is a benign skip; an unreadable
 * document or unmappable event fails only its own PRN (`failed`).
 *
 * @param {Deps} deps
 * @param {Object} options
 * @param {boolean} options.isDryRun
 */
export const reconcileStalePrnProjections = async (deps, { isDryRun }) => {
  const tally = {
    drifting: 0,
    repaired: 0,
    folded: 0,
    stamped: 0,
    stillDrifting: 0,
    failed: 0
  }
  /** @type {DriftReport[]} */
  const reports = []
  /** @type {Array<{ prnId: string, error: string }>} */
  const failures = []

  const { total, driftingIds } = await deps.findDrifting()

  for (const id of driftingIds) {
    try {
      const { outcome, report, repairKind } = await reconcileOne(
        id,
        deps,
        isDryRun
      )
      if (outcome === 'vanished') {
        continue
      }
      if (report) {
        reports.push(report)
        tally.drifting += 1
      }
      if (outcome === 'repaired') {
        tally.repaired += 1
        tally[repairKind === 'fold' ? 'folded' : 'stamped'] += 1
      } else if (outcome === 'stillDrifting') {
        tally.stillDrifting += 1
      } else {
        // 'current' and a dry-run 'drifting' map to no repair outcome.
      }
    } catch (err) {
      failures.push({ prnId: String(id), error: String(err) })
      tally.failed += 1
    }
  }

  return { total, ...tally, reports, failures }
}
