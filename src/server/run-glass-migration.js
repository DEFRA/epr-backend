import { logger } from '#common/helpers/logging/logger.js'
import {
  migrateOrganisation,
  shouldMigrateOrganisation
} from '#glass-migration/glass-migration.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

/**
 * Run glass migration for a single organisation
 * @param {Object} org
 * @param {Object} repository
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, don't actually persist changes
 * @returns {Promise<boolean>} true if migrated/would migrate, false if skipped
 */
export async function migrateGlassOrganisation(org, repository, options = {}) {
  if (!shouldMigrateOrganisation(org)) {
    return false
  }

  const migratedOrg = migrateOrganisation(org)

  if (options.dryRun) {
    logger.info({
      message: `[DRY-RUN] Would migrate glass registrations/accreditations for organisation ${org.id} (${migratedOrg.registrations.length} registrations, ${migratedOrg.accreditations.length} accreditations)`
    })
    return true
  }

  logger.info({
    message: `Migrating glass registrations/accreditations for organisation ${org.id} (${migratedOrg.registrations.length} registrations, ${migratedOrg.accreditations.length} accreditations)`
  })

  await repository.replace(org.id, org.version, migratedOrg)
  return true
}

/**
 * Execute the glass migration across all organisations
 * @param {Object} organisationsRepository
 * @param {boolean} dryRun
 * @returns {Promise<{dryRun: boolean, migrated?: number, wouldMigrate?: number, total: number}>}
 */
async function executeMigration(organisationsRepository, dryRun) {
  const organisations = await organisationsRepository.findAll()
  let migratedCount = 0

  for (const org of organisations) {
    const wasMigrated = await migrateGlassOrganisation(
      org,
      organisationsRepository,
      { dryRun }
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
      return
    }

    const lock = await server.locker.lock('glass-migration')
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping running glass migration'
      })
      return
    }

    try {
      const organisationsRepository = createOrganisationsRepository(server.db)()
      return await executeMigration(organisationsRepository, dryRun)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error(error, 'Failed to run glass migration')
  }
}
