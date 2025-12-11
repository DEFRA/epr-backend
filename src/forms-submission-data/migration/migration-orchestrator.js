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
 * @import {FormDataMigrator, Organisation, OrganisationMapEntry, OrganisationMigrationItem, OrganisationWithRegistrations} from '#formsubmission/types.js'
 */

export class MigrationOrchestrator {
  /**
   * @param {FormSubmissionsRepository} formsSubmissionRepository
   * @param {OrganisationsRepository} organisationsRepository
   */
  constructor(formsSubmissionRepository, organisationsRepository) {
    this.formsSubmissionRepository = formsSubmissionRepository
    this.organisationsRepository = organisationsRepository
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

    await upsertOrganisations(this.organisationsRepository, migrationItems)
  }
}

/**
 * @param {FormSubmissionsRepository} formsSubmissionRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {FormDataMigrator}
 */
export function createFormDataMigrator(
  formsSubmissionRepository,
  organisationsRepository
) {
  const orchestrator = new MigrationOrchestrator(
    formsSubmissionRepository,
    organisationsRepository
  )

  /** @type {FormDataMigrator} */
  return {
    migrate: orchestrator.migrate.bind(orchestrator)
  }
}
