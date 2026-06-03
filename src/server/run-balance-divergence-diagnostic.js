import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { computeRebuiltTotals } from '#waste-balances/application/compute-rebuilt-totals.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { loadAccreditationSources } from '#server/load-accreditation-sources.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

const WASTE_BALANCES_COLLECTION = 'waste-balances'
const LOCK_NAME = 'balance-divergence-diagnostic'

/**
 * @typedef {Object} EmbeddedBalanceRow
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {number} amount
 * @property {number} availableAmount
 * @property {Array<import('#waste-balances/domain/model.js').WasteBalanceTransaction>} [transactions]
 */

/**
 * @typedef {Object} DiagnosticDependencies
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepository} wasteRecordsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepository
 * @property {import('#repositories/system-logs/port.js').SystemLogsRepository} systemLogsRepository
 */

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<EmbeddedBalanceRow[]>}
 */
const findEmbeddedWasteBalances = async (db) => {
  const docs = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .find(
      {
        canonicalSource: { $ne: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER }
      },
      {
        projection: {
          _id: 0,
          accreditationId: 1,
          organisationId: 1,
          amount: 1,
          availableAmount: 1,
          transactions: 1
        }
      }
    )
    .toArray()
  return /** @type {EmbeddedBalanceRow[]} */ (/** @type {unknown} */ (docs))
}

// Re-export for callers that import from here
export { toStreamSummaryLog } from '#server/load-accreditation-sources.js'

const formatDelta = (current, rebuilt) =>
  Number((rebuilt - current).toFixed(10))

/**
 * Rebuild balance for a single embedded accreditation and return a structured
 * comparison record. Loads the registration / accreditation, the registration's
 * waste records, and the accreditation's PRN history; processes one
 * accreditation at a time so memory peaks per-accreditation rather than
 * across the entire embedded population.
 *
 * @param {EmbeddedBalanceRow} embedded
 * @param {DiagnosticDependencies} deps
 */
export const compareForEmbedded = async (embedded, deps) => {
  const sources = await loadAccreditationSources(embedded, deps)
  const { accreditation, registration, wasteRecords, prns, overseasSites } =
    sources

  const rebuilt = computeRebuiltTotals({
    accreditation,
    wasteRecords,
    prns,
    overseasSites
  })

  const stream = computeRebuiltStream({
    accreditation,
    registrationId: registration.id,
    organisationId: embedded.organisationId,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs: sources.summaryLogs
  })

  return buildComparison({
    embedded,
    registration,
    accreditation,
    rebuilt,
    stream,
    wasteRecords,
    prns,
    submitterProvenance: sources.submitterProvenance,
    submitterAgreement: sources.submitterAgreement
  })
}

const buildComparison = ({
  embedded,
  registration,
  accreditation,
  rebuilt,
  stream,
  wasteRecords,
  prns,
  submitterProvenance,
  submitterAgreement
}) => ({
  organisationId: embedded.organisationId,
  registrationNumber: registration.registrationNumber,
  accreditationNumber: accreditation.accreditationNumber ?? '<none>',
  currentAmount: embedded.amount,
  rebuiltAmount: rebuilt.amount,
  deltaAmount: formatDelta(embedded.amount, rebuilt.amount),
  currentAvailableAmount: embedded.availableAmount,
  rebuiltAvailableAmount: rebuilt.availableAmount,
  deltaAvailableAmount: formatDelta(
    embedded.availableAmount,
    rebuilt.availableAmount
  ),
  registrationStatus: registration.status,
  accreditationStatus: accreditation.status,
  wasteRecordCount: wasteRecords.length,
  wasteRecordContribution: rebuilt.wasteRecordContribution,
  prnCount: prns.length,
  prnAmountContribution: rebuilt.prnAmountContribution,
  prnAvailableAmountContribution: rebuilt.prnAvailableAmountContribution,
  streamAmount: stream.amount,
  streamAvailableAmount: stream.availableAmount,
  streamDeltaAmount: formatDelta(rebuilt.amount, stream.amount),
  streamDeltaAvailableAmount: formatDelta(
    rebuilt.availableAmount,
    stream.availableAmount
  ),
  streamEventCount: stream.events.length,
  backfilledActorCount: stream.backfilledActorCount,
  backfilledActorCountByKind: stream.backfilledActorCountByKind,
  submitterProvenance,
  submitterAgreement
})

const isDivergent = (comparison) =>
  comparison.deltaAmount !== 0 ||
  comparison.deltaAvailableAmount !== 0 ||
  comparison.streamDeltaAmount !== 0 ||
  comparison.streamDeltaAvailableAmount !== 0

const formatDivergenceLine = (comparison) =>
  [
    'Waste-balance divergence affected accreditation:',
    `organisationId=${comparison.organisationId}`,
    `registrationNumber=${comparison.registrationNumber}`,
    `accreditationNumber=${comparison.accreditationNumber}`,
    `currentAmount=${comparison.currentAmount}`,
    `rebuiltAmount=${comparison.rebuiltAmount}`,
    `deltaAmount=${comparison.deltaAmount}`,
    `currentAvailableAmount=${comparison.currentAvailableAmount}`,
    `rebuiltAvailableAmount=${comparison.rebuiltAvailableAmount}`,
    `deltaAvailableAmount=${comparison.deltaAvailableAmount}`,
    `registrationStatus=${comparison.registrationStatus}`,
    `accreditationStatus=${comparison.accreditationStatus}`,
    `wasteRecordCount=${comparison.wasteRecordCount}`,
    `wasteRecordContribution=${comparison.wasteRecordContribution}`,
    `prnCount=${comparison.prnCount}`,
    `prnAmountContribution=${comparison.prnAmountContribution}`,
    `prnAvailableAmountContribution=${comparison.prnAvailableAmountContribution}`,
    `streamAmount=${comparison.streamAmount}`,
    `streamAvailableAmount=${comparison.streamAvailableAmount}`,
    `streamDeltaAmount=${comparison.streamDeltaAmount}`,
    `streamDeltaAvailableAmount=${comparison.streamDeltaAvailableAmount}`,
    `streamEventCount=${comparison.streamEventCount}`
  ].join(' ')

const formatErrorLine = (embedded, error) =>
  [
    'Waste-balance divergence rebuild failed:',
    `organisationId=${embedded.organisationId}`,
    `accreditationId=${embedded.accreditationId}`,
    `error="${error.message}"`
  ].join(' ')

const formatBackfillByKind = (byKind) =>
  Object.keys(byKind)
    .sort((a, b) => a.localeCompare(b))
    .map((kind) => `${kind}:${byKind[kind]}`)
    .join(',')

const formatProvenance = (provenance) =>
  `systemLog:${provenance.systemLog},transaction:${provenance.transaction},backfill:${provenance.backfill}`

const formatBackfillLine = (comparison) =>
  [
    'Waste-balance rebuild used backfill actor:',
    `organisationId=${comparison.organisationId}`,
    `registrationNumber=${comparison.registrationNumber}`,
    `accreditationNumber=${comparison.accreditationNumber}`,
    `backfilledActorCount=${comparison.backfilledActorCount}`,
    `backfilledActorCountByKind=${formatBackfillByKind(comparison.backfilledActorCountByKind)}`,
    `submitterProvenance=${formatProvenance(comparison.submitterProvenance)}`,
    `streamEventCount=${comparison.streamEventCount}`
  ].join(' ')

const formatAgreementMismatchLine = (comparison) =>
  [
    'Waste-balance submitter source disagreement:',
    `organisationId=${comparison.organisationId}`,
    `registrationNumber=${comparison.registrationNumber}`,
    `accreditationNumber=${comparison.accreditationNumber}`,
    `submitterAgreementCompared=${comparison.submitterAgreement.comparedCount}`,
    `submitterAgreementMismatched=${comparison.submitterAgreement.mismatchedCount}`
  ].join(' ')

const accumulateProvenance = (totals, provenance) => {
  totals.systemLog += provenance.systemLog
  totals.transaction += provenance.transaction
  totals.backfill += provenance.backfill
}

/**
 * @param {import('mongodb').Db} db
 * @param {DiagnosticDependencies} deps
 */
const runDiagnostic = async (db, deps) => {
  logger.info({
    message: 'Running waste-balance divergence diagnostic'
  })

  const embedded = await findEmbeddedWasteBalances(db)

  let scanned = 0
  let changed = 0
  let failed = 0
  const provenanceTotals = { systemLog: 0, transaction: 0, backfill: 0 }
  const agreementTotals = { comparedCount: 0, mismatchedCount: 0 }

  for (const row of embedded) {
    scanned += 1
    try {
      const comparison = await compareForEmbedded(row, deps)
      accumulateProvenance(provenanceTotals, comparison.submitterProvenance)
      agreementTotals.comparedCount +=
        comparison.submitterAgreement.comparedCount
      agreementTotals.mismatchedCount +=
        comparison.submitterAgreement.mismatchedCount
      if (comparison.submitterAgreement.mismatchedCount > 0) {
        logger.warn({ message: formatAgreementMismatchLine(comparison) })
      }
      if (comparison.backfilledActorCount > 0) {
        logger.warn({ message: formatBackfillLine(comparison) })
      }
      if (isDivergent(comparison)) {
        changed += 1
        logger.info({ message: formatDivergenceLine(comparison) })
      }
    } catch (error) {
      failed += 1
      logger.info({ message: formatErrorLine(row, error) })
    }
  }

  logger.info({
    message: `Waste-balance divergence diagnostic: scanned=${scanned} changed=${changed} failed=${failed} submitterProvenance=${formatProvenance(provenanceTotals)} submitterAgreement=compared:${agreementTotals.comparedCount},mismatched:${agreementTotals.mismatchedCount}`
  })
}

/**
 * @param {Object} server
 * @returns {Promise<DiagnosticDependencies>}
 */
const buildDependencies = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const wasteRecordsRepository = (
    await createWasteRecordsRepository(server.db)
  )()
  const prnRepositoryFactory = await createPackagingRecyclingNotesRepository(
    server.db,
    []
  )
  const prnRepository = prnRepositoryFactory(logger)
  const overseasSitesRepository = (
    await createOverseasSitesRepository(server.db)
  )()
  const summaryLogsRepository = (
    await createSummaryLogsRepository(server.db, /** @type {any} */ ({}))
  )(logger)
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  return /** @type {DiagnosticDependencies} */ ({
    organisationsRepository,
    wasteRecordsRepository,
    prnRepository,
    overseasSitesRepository,
    summaryLogsRepository,
    systemLogsRepository
  })
}

/**
 * Pre-cutover diagnostic for PAE-1382 / PAE-1441: rebuilds each embedded
 * accreditation's waste balance from authoritative sources (waste records +
 * PRN history) and surfaces divergence against the stored embedded balance.
 * Two motivators:
 * - PAE-1382 (cutover comms): every accreditation whose visible balance will
 *   change at the ledger flag flip is logged so operators can brief the
 *   affected organisations before the cutover.
 * - PAE-1441 (duplicate-transaction detection): the same authoritative-sources
 *   rebuild surfaces divergence introduced by the PAE-1439 concurrency bug
 *   (duplicate waste-balance transactions inflating the embedded balance).
 *
 * Read-only, safe under live traffic. Runs under a cross-instance lock so a
 * single pod per deploy executes the scan; processes accreditations
 * sequentially so memory peaks per-accreditation rather than across the full
 * embedded population.
 *
 * @param {Object} server - Hapi server instance
 */
export const runBalanceDivergenceDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping waste-balance divergence diagnostic'
      })
      return
    }
    try {
      const deps = await buildDependencies(server)
      await runDiagnostic(server.db, deps)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run waste-balance divergence diagnostic'
    })
  }
}
