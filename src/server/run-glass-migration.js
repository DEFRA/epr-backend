import { logger } from '#common/helpers/logging/logger.js'
import {
  migrateOrganisation,
  shouldMigrateOrganisation
} from '#glass-migration/glass-migration.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { auditGlassMigration } from '#root/auditing/glass-migration.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationReplacement} OrganisationReplacement */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

/**
 * Run glass migration for a single organisation
 * @param {Object} org
 * @param {Object} repository
 * @param {Object} options
 * @param {boolean} [options.dryRun] - If true, don't actually persist changes
 * @param {SystemLogsRepository} [options.systemLogsRepository] - Repository for audit logging
 * @returns {Promise<boolean>} true if migrated/would migrate, false if skipped
 */
export async function migrateGlassOrganisation(org, repository, options = {}) {
  if (!shouldMigrateOrganisation(org)) {
    return false
  }

  // Separate identity from data - the repository contract expects these as separate parameters
  const { id, version, ...orgData } = org

  /** @type {OrganisationReplacement} */
  let migratedOrg
  try {
    migratedOrg = migrateOrganisation(orgData)
  } catch (error) {
    logger.error({
      message: `Failed to migrate organisation ${id}: ${error.message}`
    })
    return false
  }

  const regCount = migratedOrg.registrations?.length ?? 0
  const accCount = migratedOrg.accreditations?.length ?? 0

  if (options.dryRun) {
    logger.info({
      message: `[DRY-RUN] Would migrate glass registrations/accreditations for organisation ${id} (${regCount} registrations, ${accCount} accreditations)`
    })
    return true
  }

  logger.info({
    message: `Migrating glass registrations/accreditations for organisation ${id} (${regCount} registrations, ${accCount} accreditations)`
  })

  await repository.replace(id, version, migratedOrg)

  if (options.systemLogsRepository) {
    await auditGlassMigration(
      options.systemLogsRepository,
      id,
      orgData,
      migratedOrg
    )
  }

  return true
}

/**
 * Execute the glass migration across all organisations
 * @param {Object} organisationsRepository
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {boolean} dryRun
 * @returns {Promise<{dryRun: boolean, migrated?: number, wouldMigrate?: number, total: number}>}
 */
async function executeMigration(
  organisationsRepository,
  systemLogsRepository,
  dryRun
) {
  const organisations = await organisationsRepository.findAll()
  let migratedCount = 0

  for (const org of organisations) {
    const wasMigrated = await migrateGlassOrganisation(
      org,
      organisationsRepository,
      { dryRun, systemLogsRepository }
    )
    if (wasMigrated) {
      migratedCount++
    }
  }

  if (dryRun) {
    logger.info({
      message: `[DRY-RUN] Glass migration would migrate ${migratedCount}/${organisations.length} organisations`
    })
    return {
      dryRun: true,
      wouldMigrate: migratedCount,
      total: organisations.length
    }
  }

  logger.info({
    message: `Glass migration completed successfully (${migratedCount}/${organisations.length} organisations migrated)`
  })
  return {
    dryRun: false,
    migrated: migratedCount,
    total: organisations.length
  }
}

/**
 * Run glass migration on startup
 * Renames GL suffix to GR/GO based on glassRecyclingProcess
 * Splits records with both processes into two
 * @param {Object} server
 * @returns {Promise<{dryRun: boolean, migrated?: number, wouldMigrate?: number, total: number}|undefined>}
 */
export const runGlassMigration = async (server) => {
  try {
    const mode = server.featureFlags.getGlassMigrationMode()
    const dryRun = mode === 'dry-run'

    logger.info({
      message: `Starting glass migration. Mode: ${mode}`
    })

    if (mode === 'disabled') {
      return undefined
    }

    const lock = await server.locker.lock('glass-migration')
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping running glass migration'
      })
      return undefined
    }

    try {
      const organisationsRepository = (
        await createOrganisationsRepository(server.db)
      )()
      const systemLogsRepository = await createSystemLogsRepository(
        server.db,
        logger
      )
      return await executeMigration(
        organisationsRepository,
        systemLogsRepository,
        dryRun
      )
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error(error, 'Failed to run glass migration')
    return undefined
  }
}
