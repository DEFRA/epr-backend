import { logger } from '#common/helpers/logging/logger.js'
import { getConfig } from '#root/config.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/mongodb.js'
import { createMongoStreamRepository } from '#waste-balances/repository/stream-mongodb.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { loadAccreditationSources } from '#server/load-accreditation-sources.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

const WASTE_BALANCES_COLLECTION = 'waste-balances'
const LOCK_NAME = 'stream-promotion'

/**
 * @param {import('mongodb').Db} db
 */
const findMigratingBalances = async (db) => {
  const docs = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .find(
      { canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING },
      {
        projection: {
          _id: 0,
          accreditationId: 1
        }
      }
    )
    .toArray()
  return /** @type {{ accreditationId: string }[]} */ (
    /** @type {unknown} */ (docs)
  )
}

/**
 * @param {import('mongodb').Db} db
 */
const findEmbeddedBalances = async (db) => {
  const docs = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .find(
      { canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED },
      {
        projection: {
          _id: 0,
          accreditationId: 1,
          organisationId: 1,
          registrationId: 1
        }
      }
    )
    .toArray()
  return /** @type {{ accreditationId: string, organisationId: string, registrationId: string }[]} */ (
    /** @type {unknown} */ (docs)
  )
}

/**
 * @typedef {Object} PromotionDependencies
 * @property {ReturnType<import('#waste-balances/repository/port.js').WasteBalancesRepositoryFactory>} wasteBalancesRepository
 * @property {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepository} wasteRecordsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepository} summaryLogsRepository
 */

/**
 * @param {{ accreditationId: string, organisationId: string }} row
 * @param {PromotionDependencies} deps
 * @returns {Promise<{ events: Array, registration: { id: string } } | null>}
 *   null when the accreditation has no active registration (nothing to rebuild)
 */
const rebuildEvents = async (row, deps) => {
  const sources = await loadAccreditationSources(row, deps)
  const { events } = computeRebuiltStream({
    accreditation: sources.accreditation,
    registrationId: sources.registration.id,
    organisationId: row.organisationId,
    wasteRecords: sources.wasteRecords,
    prns: sources.prns,
    overseasSites: sources.overseasSites,
    summaryLogs: sources.summaryLogs
  })
  return { events, registration: sources.registration }
}

/**
 * @param {{ accreditationId: string, organisationId: string, registrationId: string }} row
 * @param {PromotionDependencies} deps
 */
const promoteAccreditation = async (row, deps) => {
  const { wasteBalancesRepository, streamRepository } = deps

  // Capture version BEFORE rebuilding events. A submission that writes waste
  // records and bumps version during rebuildEvents must push version past
  // the capture so the flip safely no-ops (retried next boot with fresh data).
  const captured = await wasteBalancesRepository.findByAccreditationId(
    row.accreditationId
  )
  if (!captured) {
    throw new Error(
      `No waste balance found for accreditation ${row.accreditationId}`
    )
  }

  const rebuildResult = await rebuildEvents(row, deps)

  // Invariant: a non-zero embedded balance must reconstruct to a non-empty
  // stream. An empty rebuild from authoritative sources that don't account
  // for the balance (e.g. a summary log submitted against a non-approved
  // registration the rebuild can't see) would flip to ledger and read back
  // zero. Abort loudly and leave the accreditation embedded for the next
  // boot rather than silently zeroing a real balance.
  const capturedNonZero =
    captured.amount !== 0 || captured.availableAmount !== 0

  if (capturedNonZero && rebuildResult.events.length === 0) {
    throw new Error(
      `Accreditation ${row.accreditationId} has a non-zero balance (amount=${captured.amount}, availableAmount=${captured.availableAmount}) but rebuilds to an empty stream`
    )
  }

  const migratingResult =
    await wasteBalancesRepository.flipCanonicalSourceToMigrating({
      accreditationId: row.accreditationId,
      capturedVersion: captured.version
    })

  if (
    migratingResult?.canonicalSource !==
    WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
  ) {
    return 'skipped'
  }

  const { events, registration } = rebuildResult
  // Idempotency: if a previous boot crashed between bulkAppendEvents and
  // flipCanonicalSourceToLedger, stale events may exist. Deleting first
  // means a restart always replays from the authoritative sources rather
  // than appending on top of a partial write. An alternative would be to
  // skip the delete and let bulkAppendEvents fail on a sequence conflict,
  // but that turns a recoverable restart into a stuck accreditation.
  await streamRepository.deleteByPartition(registration.id, row.accreditationId)
  await streamRepository.bulkAppendEvents(events)

  // Use the ORIGINAL captured version, not a re-read. If a concurrent
  // mutation (PRN op or summary log upload) bumped version while we were
  // migrating, the filter misses and the flip no-ops. The accreditation
  // retries next boot with fresh data that includes the mutation.
  const ledgerResult =
    await wasteBalancesRepository.flipCanonicalSourceToLedger({
      accreditationId: row.accreditationId,
      registrationId: registration.id,
      capturedVersion: captured.version
    })

  if (ledgerResult?.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    logger.info({
      message: `Stream promotion: flip to ledger did not land for accreditation ${row.accreditationId}, will retry next boot`
    })
    return 'failed'
  }

  return 'promoted'
}

/**
 * @param {Object} server
 * @returns {Promise<PromotionDependencies>}
 */
const buildDependencies = async (server) => {
  const streamRepositoryFactory = await createMongoStreamRepository(server.db)
  const streamRepository = streamRepositoryFactory()

  const wasteBalancesFactory = await createWasteBalancesRepository(server.db, {
    streamRepository
  })
  const wasteBalancesRepository = wasteBalancesFactory()

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

  return {
    wasteBalancesRepository,
    streamRepository,
    organisationsRepository,
    wasteRecordsRepository,
    prnRepository,
    overseasSitesRepository,
    summaryLogsRepository
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {PromotionDependencies} deps
 */
const runPromotion = async (db, deps) => {
  logger.info({
    message: 'Running stream promotion'
  })

  // Recovery pass: reset stuck migrating accreditations
  const migrating = await findMigratingBalances(db)
  for (const row of migrating) {
    logger.info({
      message: `Stream promotion: resetting stuck migrating accreditation ${row.accreditationId}`
    })
    await deps.wasteBalancesRepository.resetCanonicalSourceToEmbedded({
      accreditationId: row.accreditationId
    })
  }

  // Main pass: promote all embedded accreditations
  const embedded = await findEmbeddedBalances(db)

  let promoted = 0
  let skipped = 0
  let failed = 0

  for (const row of embedded) {
    try {
      const result = await promoteAccreditation(row, deps)
      if (result === 'promoted') {
        promoted += 1
      } else if (result === 'failed') {
        failed += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      failed += 1
      logger.error({
        message: `Stream promotion failed: accreditationId=${row.accreditationId} error="${error.message}"`
      })
    }
  }

  const summaryLevel = failed > 0 ? 'warn' : 'info'
  logger[summaryLevel]({
    message: `Stream promotion complete: promoted=${promoted} skipped=${skipped} failed=${failed}`
  })
}

/**
 * Startup sweep that migrates each embedded accreditation to the event-sourced
 * stream. For each accreditation: reconstructs the full event history via
 * computeRebuiltStream, persists the events, and flips the canonical source
 * marker from 'embedded' to 'ledger'.
 *
 * Runs behind FEATURE_FLAG_WASTE_BALANCE_LEDGER under a distributed lock so
 * only one pod per deploy executes the sweep. Idempotent on restart: stuck
 * 'migrating' accreditations are reset before the main pass, and stream
 * events are deleted and re-inserted before each flip.
 *
 * @param {Object} server - Hapi server instance
 */
export const runStreamPromotion = async (server) => {
  const config = getConfig()
  if (!config.get('featureFlags.wasteBalanceLedger')) {
    logger.info({
      message: 'Stream promotion disabled (feature flag off)'
    })
    return
  }

  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping stream promotion'
      })
      return
    }
    try {
      const deps = await buildDependencies(server)
      await runPromotion(server.db, deps)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run stream promotion'
    })
  }
}
