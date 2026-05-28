import { logger } from '#common/helpers/logging/logger.js'
import { getConfig } from '#root/config.js'
import { resolveOverseasSites } from '#application/waste-records/resolve-overseas-sites.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/mongodb.js'
import { createMongoStreamRepository } from '#waste-balances/repository/stream-mongodb.js'
import { computeRebuiltStream } from '#waste-balances/application/compute-rebuilt-stream.js'
import { toStreamSummaryLog } from '#server/run-balance-divergence-diagnostic.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

/** @type {Set<import('#domain/organisations/registration.js').Registration['status']>} */
const ACTIVE_REGISTRATION_STATUSES = new Set([
  REG_ACC_STATUS.APPROVED,
  REG_ACC_STATUS.CANCELLED,
  REG_ACC_STATUS.SUSPENDED
])

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
 * @param {{ accreditationId: string, organisationId: string, registrationId: string }} row
 * @param {PromotionDependencies} deps
 */
/**
 * Load the organisation, registration, and accreditation for a balance row,
 * then rebuild the event stream from authoritative sources.
 *
 * @param {{ accreditationId: string, organisationId: string }} row
 * @param {PromotionDependencies} deps
 */
const rebuildEvents = async (row, deps) => {
  const {
    organisationsRepository,
    prnRepository,
    wasteRecordsRepository,
    overseasSitesRepository,
    summaryLogsRepository
  } = deps

  const organisation = await organisationsRepository.findById(
    row.organisationId
  )
  const accreditation = organisation.accreditations.find(
    (a) => a.id === row.accreditationId
  )
  if (!accreditation) {
    throw new Error(
      `Accreditation ${row.accreditationId} not found on organisation ${row.organisationId}`
    )
  }
  const registration = organisation.registrations.find(
    (r) =>
      r.accreditationId === row.accreditationId &&
      ACTIVE_REGISTRATION_STATUSES.has(r.status)
  )
  if (!registration) {
    throw new Error(
      `No registration links to accreditation ${row.accreditationId} on organisation ${row.organisationId}`
    )
  }

  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    row.organisationId,
    registration.id
  )
  const prns = await prnRepository.findByAccreditation(row.accreditationId)
  const overseasSites = await resolveOverseasSites(
    organisationsRepository,
    overseasSitesRepository,
    row.organisationId,
    registration.id
  )
  const summaryLogDocs = await summaryLogsRepository.findAllByOrgReg(
    row.organisationId,
    registration.id
  )

  const { events } = computeRebuiltStream({
    accreditation,
    wasteRecords,
    prns,
    overseasSites,
    summaryLogs: summaryLogDocs
      .filter(
        ({ summaryLog }) => summaryLog.status === SUMMARY_LOG_STATUS.SUBMITTED
      )
      .map(toStreamSummaryLog)
  })

  return { events, registration }
}

/**
 * @param {{ accreditationId: string, organisationId: string, registrationId: string }} row
 * @param {PromotionDependencies} deps
 */
const promoteAccreditation = async (row, deps) => {
  const { wasteBalancesRepository, streamRepository } = deps

  const { events, registration } = await rebuildEvents(row, deps)

  const captured = await wasteBalancesRepository.findByAccreditationId(
    row.accreditationId
  )
  if (!captured) {
    throw new Error(
      `No waste balance found for accreditation ${row.accreditationId}`
    )
  }

  const migratingResult =
    await wasteBalancesRepository.flipCanonicalSourceToMigrating({
      accreditationId: row.accreditationId,
      capturedVersion: captured.version
    })

  if (
    !migratingResult ||
    migratingResult.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
  ) {
    return 'skipped'
  }

  await streamRepository.deleteByPartition(registration.id, row.accreditationId)
  await streamRepository.bulkAppendEvents(events)

  const afterStream = await wasteBalancesRepository.findByAccreditationId(
    row.accreditationId
  )
  if (!afterStream) {
    throw new Error(
      `Waste balance disappeared for accreditation ${row.accreditationId}`
    )
  }

  const ledgerResult =
    await wasteBalancesRepository.flipCanonicalSourceToLedger({
      accreditationId: row.accreditationId,
      capturedVersion: afterStream.version
    })

  if (
    !ledgerResult ||
    ledgerResult.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
  ) {
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
      logger.info({
        message: `Stream promotion failed: accreditationId=${row.accreditationId} error="${error.message}"`
      })
    }
  }

  logger.info({
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
