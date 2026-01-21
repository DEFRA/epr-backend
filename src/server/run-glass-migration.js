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
 * @returns {Promise<boolean>} true if migrated, false if skipped
 */
export async function migrateGlassOrganisation(org, repository) {
  if (!shouldMigrateOrganisation(org)) {
    return false
  }

  const migratedOrg = migrateOrganisation(org)

  logger.info({
    message: `Migrating glass registrations/accreditations for organisation ${org.id}`,
    organisationId: org.id,
    registrationCount: migratedOrg.registrations.length,
    accreditationCount: migratedOrg.accreditations.length
  })

  await repository.replace(org.id, org.version, migratedOrg)
  return true
}

/**
 * Run glass migration on startup
 * Renames GL suffix to GR/GO based on glassRecyclingProcess
 * Splits records with both processes into two
 * @param {Object} server
 * @param {Object} options
 */
export const runGlassMigration = async (server, options = {}) => {
  try {
    const featureFlagsInstance = options.featureFlags || server.featureFlags
    logger.info({
      message: `Starting glass migration. Feature flag enabled: ${featureFlagsInstance.isGlassMigrationEnabled()}`
    })

    if (featureFlagsInstance.isGlassMigrationEnabled()) {
      const lock = await server.locker.lock('glass-migration')
      if (!lock) {
        logger.info({
          message: 'Unable to obtain lock, skipping running glass migration'
        })
        return
      }

      try {
        const organisationsRepository =
          options.organisationsRepository ??
          createOrganisationsRepository(server.db)()

        const organisations = await organisationsRepository.findAll()
        let migratedCount = 0

        for (const org of organisations) {
          const wasMigrated = await migrateGlassOrganisation(
            org,
            organisationsRepository
          )
          if (wasMigrated) {
            migratedCount++
          }
        }

        logger.info({
          message: `Glass migration completed successfully`,
          migratedCount,
          totalOrganisations: organisations.length
        })
      } finally {
        await lock.free()
      }
    }
  } catch (error) {
    logger.error(error, 'Failed to run glass migration')
  }
}
