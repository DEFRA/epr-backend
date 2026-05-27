import { logger } from '#common/helpers/logging/logger.js'
import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { computeRebuiltTotals } from '#waste-balances/application/compute-rebuilt-totals.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/** @type {Set<import('#domain/organisations/registration.js').Registration['status']>} */
const ACTIVE_REGISTRATION_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.CANCELLED,
  REG_ACC_STATUS.SUSPENDED
])

const WASTE_BALANCES_COLLECTION = 'waste-balances'
const LOCK_NAME = 'balance-divergence-diagnostic'

/**
 * @typedef {Object} EmbeddedBalanceRow
 * @property {string} accreditationId
 * @property {string} organisationId
 * @property {number} amount
 * @property {number} availableAmount
 */

/**
 * @typedef {Object} DiagnosticDependencies
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepository} wasteRecordsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepository
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
          availableAmount: 1
        }
      }
    )
    .toArray()
  return /** @type {EmbeddedBalanceRow[]} */ (/** @type {unknown} */ (docs))
}

/**
 * Map a summary log document from findAllByOrgReg into the shape that
 * computeRebuiltStream expects. Uses summaryLog.file.id (the file
 * identifier stored on waste record versions) rather than the document
 * _id, which is a different namespace.
 *
 * @param {{ summaryLog: { file: { id: string }, status: string, submittedAt?: string } }} doc
 */
export const toStreamSummaryLog = ({ summaryLog }) => ({
  id: summaryLog.file.id,
  status: summaryLog.status,
  submittedAt: summaryLog.submittedAt
})

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
const compareForEmbedded = async (embedded, deps) => {
  const {
    organisationsRepository,
    prnRepository,
    wasteRecordsRepository,
    overseasSitesRepository,
    summaryLogsRepository
  } = deps

  const organisation = await organisationsRepository.findById(
    embedded.organisationId
  )
  const accreditation = organisation.accreditations.find(
    (a) => a.id === embedded.accreditationId
  )
  if (!accreditation) {
    throw new Error(
      `Accreditation ${embedded.accreditationId} not found on organisation ${embedded.organisationId}`
    )
  }
  const registration = organisation.registrations.find(
    (r) =>
      r.accreditationId === embedded.accreditationId &&
      ACTIVE_REGISTRATION_STATUSES.has(r.status)
  )
  if (!registration) {
    throw new Error(
      `No registration links to accreditation ${embedded.accreditationId} on organisation ${embedded.organisationId}`
    )
  }

  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    embedded.organisationId,
    registration.id
  )
  const prns = await prnRepository.findByAccreditation(embedded.accreditationId)

  const overseasSites = await resolveOverseasSites(
    organisationsRepository,
    overseasSitesRepository,
    embedded.organisationId,
    registration.id
  )

  const rebuilt = computeRebuiltTotals({
    accreditation,
    wasteRecords,
    prns,
    overseasSites
  })

  const summaryLogDocs = await summaryLogsRepository.findAllByOrgReg(
    embedded.organisationId,
    registration.id
  )

  const stream = computeRebuiltStream({
    accreditation,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs: summaryLogDocs.map(toStreamSummaryLog)
  })

  return buildComparison(
    embedded,
    registration,
    accreditation,
    rebuilt,
    stream,
    wasteRecords,
    prns
  )
}

const buildComparison = (
  embedded,
  registration,
  accreditation,
  rebuilt,
  stream,
  wasteRecords,
  prns
) => ({
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
  streamEventCount: stream.events.length
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

  for (const row of embedded) {
    scanned += 1
    try {
      const comparison = await compareForEmbedded(row, deps)
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
    message: `Waste-balance divergence diagnostic: scanned=${scanned} changed=${changed} failed=${failed}`
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

  return /** @type {DiagnosticDependencies} */ ({
    organisationsRepository,
    wasteRecordsRepository,
    prnRepository,
    overseasSitesRepository,
    summaryLogsRepository
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
