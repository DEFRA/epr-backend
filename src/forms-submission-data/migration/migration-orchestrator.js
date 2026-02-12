import Boom from '@hapi/boom'
import { logger } from '#common/helpers/logging/logger.js'
import {
  linkItemsToOrganisations,
  linkRegistrationToAccreditations
} from '#formsubmission/link-form-submissions.js'
import { systemReferencesRequiringOrgIdMatch } from '#formsubmission/data-migration-config.js'
import { transformAll } from './submission-transformer.js'
import { getSubmissionsToMigrate } from './migration-delta-calculator.js'
import { upsertOrganisations } from './organisation-persistence.js'

/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 * @import {FormDataMigrator, Organisation, OrganisationMapEntry, OrganisationMigrationItem, OrganisationWithRegistrations} from '#formsubmission/types.js'
 */

export class MigrationOrchestrator {
  /**
   * @param {FormSubmissionsRepository} formsSubmissionRepository
   * @param {OrganisationsRepository} organisationsRepository
   * @param {SystemLogsRepository} systemLogsRepository
   */
  constructor(
    formsSubmissionRepository,
    organisationsRepository,
    systemLogsRepository
  ) {
    this.formsSubmissionRepository = formsSubmissionRepository
    this.organisationsRepository = organisationsRepository
    this.systemLogsRepository = systemLogsRepository
  }

  linkRegistrations(organisations, registrations) {
    return linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations',
      systemReferencesRequiringOrgIdMatch()
    )
  }

  linkAccreditations(organisations, accreditations) {
    return linkItemsToOrganisations(
      organisations,
      accreditations,
      'accreditations',
      systemReferencesRequiringOrgIdMatch()
    )
  }

  async fetchExistingOrganisations(
    migratedSubmissionIds,
    registrationsToMigrate,
    accreditationsToMigrate
  ) {
    const organisationsWithNewSubmissions = new Set([
      ...registrationsToMigrate.map((r) => r.systemReference),
      ...accreditationsToMigrate.map((r) => r.systemReference)
    ])

    const existingOrganisationsWithNewSubmissions =
      migratedSubmissionIds.organisations.intersection(
        organisationsWithNewSubmissions
      )

    const organisationEntries = await Promise.all(
      [...existingOrganisationsWithNewSubmissions].map(
        async (orgId) =>
          /** @type {OrganisationMapEntry} */ ([
            orgId,
            await this.organisationsRepository.findById(orgId)
          ])
      )
    )

    return new Map(organisationEntries)
  }

  async transformAndLinkAllNewSubmissions(
    migratedSubmissionIds,
    submissionsToMigrate
  ) {
    const { organisations, registrations, accreditations } = await transformAll(
      this.formsSubmissionRepository,
      submissionsToMigrate
    )

    const exitingOrgsWithSubmissionsToMigrate =
      await this.fetchExistingOrganisations(
        migratedSubmissionIds,
        registrations,
        accreditations
      )

    const allOrganisationsToMigrate = organisations.concat(
      ...exitingOrgsWithSubmissionsToMigrate.values()
    )

    /** @type {OrganisationWithRegistrations[]} */
    const organisationsWithRegistrations = this.linkRegistrations(
      allOrganisationsToMigrate,
      registrations
    )

    /** @type {Organisation[]} */
    const organisationsWithAccreditations = this.linkAccreditations(
      organisationsWithRegistrations,
      accreditations
    )

    return linkRegistrationToAccreditations(organisationsWithAccreditations)
  }

  prepareMigrationItems(organisations, submissionsToMigrate) {
    return organisations.map((org) => {
      /** @type {OrganisationMigrationItem} */
      return {
        value: org,
        operation: submissionsToMigrate.organisations.has(org.id)
          ? 'insert'
          : 'update'
      }
    })
  }

  /**
   * Migrate a single organisation by ID.
   * @param {string} id - The organisation form submission ID
   * @returns {Promise<{organisation: boolean, registrations: number, accreditations: number} | null>}
   */
  async migrateById(id) {
    const orgSubmission =
      await this.formsSubmissionRepository.findOrganisationById(id)

    if (!orgSubmission) {
      return null
    }

    const [registrations, accreditations] = await Promise.all([
      this.formsSubmissionRepository.findRegistrationsBySystemReference(id),
      this.formsSubmissionRepository.findAccreditationsBySystemReference(id)
    ])

    logger.info({
      message: `Migrating organisation ${id} with ${registrations.length} registrations and ${accreditations.length} accreditations`
    })

    const pendingMigration = {
      organisations: new Set([id]),
      registrations: new Set(registrations.map((r) => r.id)),
      accreditations: new Set(accreditations.map((a) => a.id)),
      totalCount: 1 + registrations.length + accreditations.length
    }

    const migratedIds = await this.organisationsRepository.findAllIds()
    const migrated = {
      organisations: migratedIds.organisations,
      registrations: migratedIds.registrations,
      accreditations: migratedIds.accreditations
    }

    const organisations = await this.transformAndLinkAllNewSubmissions(
      migrated,
      pendingMigration
    )

    const migrationItems = this.prepareMigrationItems(
      organisations,
      pendingMigration
    )

    const { failed } = await upsertOrganisations(
      this.organisationsRepository,
      this.systemLogsRepository,
      migrationItems
    )

    if (failed.length > 0) {
      throw Boom.internal(`Failed to persist migrated organisation ${id}`)
    }

    logger.info({
      message: `Successfully migrated organisation ${id}`
    })

    return {
      organisation: true,
      registrations: registrations.length,
      accreditations: accreditations.length
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async migrate() {
    const { migrated, pendingMigration } = await getSubmissionsToMigrate(
      this.formsSubmissionRepository,
      this.organisationsRepository
    )

    if (pendingMigration.totalCount === 0) {
      logger.info({ message: 'No new form submissions to migrate' })
      return
    }

    logger.info({
      message: `Found ${pendingMigration.organisations.size} organisations, ${pendingMigration.registrations.size} registrations, ${pendingMigration.accreditations.size} accreditations to migrate`
    })

    const organisations = await this.transformAndLinkAllNewSubmissions(
      migrated,
      pendingMigration
    )

    const migrationItems = this.prepareMigrationItems(
      organisations,
      pendingMigration
    )

    await upsertOrganisations(
      this.organisationsRepository,
      this.systemLogsRepository,
      migrationItems
    )
  }
}

/**
 * @param {FormSubmissionsRepository} formsSubmissionRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SystemLogsRepository} systemLogsRepository
 * @returns {FormDataMigrator}
 */
export function createFormDataMigrator(
  formsSubmissionRepository,
  organisationsRepository,
  systemLogsRepository
) {
  const orchestrator = new MigrationOrchestrator(
    formsSubmissionRepository,
    organisationsRepository,
    systemLogsRepository
  )

  /** @type {FormDataMigrator} */
  return {
    migrate: orchestrator.migrate.bind(orchestrator)
  }
}
