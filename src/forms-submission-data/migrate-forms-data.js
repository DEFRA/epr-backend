import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { parseAccreditationSubmission } from '#formsubmission/accreditation/transform-accreditation.js'
import {
  linkItemsToOrganisations,
  linkRegistrationToAccreditations
} from '#formsubmission/link-form-submissions.js'
import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { removeUndefinedValues } from '#formsubmission/parsing-common/transform-utils.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { systemReferencesRequiringOrgIdMatch } from '#formsubmission/data-migration-config.js'

/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {BaseOrganisation, Organisation, OrganisationMapEntry, OrganisationMigrationItem, OrganisationWithRegistrations} from './types.js'
 */

/**
 * @typedef {Object} SuccessResult
 * @property {true} success
 * @property {string} id
 * @property {'inserted' | 'updated' | 'unchanged'} action
 */

/**
 * @typedef {Object} FailureResult
 * @property {false} success
 * @property {string} id
 * @property {string} phase
 */

/**
 * @typedef {SuccessResult | FailureResult} MigrationResult
 */

/**
 * @typedef {Object} FormDataMigrator
 * @property {() => Promise<void>} migrate - Execute the migration
 */

class MigratorProcessor {
  constructor(formsSubmissionRepository, organisationsRepository) {
    this.formsSubmissionRepository = formsSubmissionRepository
    this.organisationsRepository = organisationsRepository
    this.fetchTransformConfigs = {
      organisation: {
        fetch: (id) => this.formsSubmissionRepository.findOrganisationById(id),
        parse: (s) => parseOrgSubmission(s.id, s.orgId, s.rawSubmissionData)
      },
      registration: {
        fetch: (id) => this.formsSubmissionRepository.findRegistrationById(id),
        parse: (s) => parseRegistrationSubmission(s.id, s.rawSubmissionData)
      },
      accreditation: {
        fetch: (id) => this.formsSubmissionRepository.findAccreditationById(id),
        parse: (s) => parseAccreditationSubmission(s.id, s.rawSubmissionData)
      }
    }
  }

  /**
   * Type predicate to narrow MigrationResult to SuccessResult
   * @param {MigrationResult} result
   * @returns {result is SuccessResult}
   */
  isSuccessResult(result) {
    return result.success === true
  }

  /**
   * Partitions Promise.allSettled results into successful and failed arrays
   * @param {PromiseSettledResult<MigrationResult>[]} results
   * @returns {{successful: SuccessResult[], failed: FailureResult[]}}
   */
  partitionResults(results) {
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value)
      .reduce(
        (acc, result) => {
          const target = this.isSuccessResult(result)
            ? acc.successful
            : acc.failed
          target.push(result)
          return acc
        },
        { successful: [], failed: [] }
      )
  }

  /**
   * Determines which form submissions need to be migrated by comparing
   * all submission IDs against already migrated ones
   *
   * @param {import('#repositories/organisations/port.js').OrganisationIds} migratedSubmissionIds - IDs of submissions already migrated
   * @returns {Promise<import('#repositories/form-submissions/port.js').FormSubmissionIds>} Submissions that need migration
   */
  async getSubmissionsToMigrate(migratedSubmissionIds) {
    const submissionIds =
      await this.formsSubmissionRepository.findAllFormSubmissionIds()
    return {
      organisations: submissionIds.organisations.difference(
        migratedSubmissionIds.organisations
      ),
      registrations: submissionIds.registrations.difference(
        migratedSubmissionIds.registrations
      ),
      accreditations: submissionIds.accreditations.difference(
        migratedSubmissionIds.accreditations
      )
    }
  }

  /**
   * Fetches and transforms form submissions in parallel, handling errors gracefully

   * @param {Set<string>} submissionIds - Set of submission IDs to fetch and transform
   * @param {'organisation'|'registration'|'accreditation'} type - Type of submission
   * @returns {Promise<Array>} Successfully transformed submissions
   */
  async fetchAndTransform(submissionIds, type) {
    const { fetch, parse } = this.fetchTransformConfigs[type]

    const promises = [...submissionIds].map((id) =>
      fetch(id)
        .then(parse)
        .then((value) => ({ success: true, value }))
        .catch((error) => ({ success: false, error, id }))
    )

    const results = await Promise.all(promises)

    const { successful, failed } = results.reduce(
      (acc, result) => {
        if (result.success) {
          acc.successful.push(result.value)
        } else {
          acc.failed.push(result)
          logger.error({
            error: result.error,
            message: `Error transforming ${type} submission`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: result.id
            }
          })
        }
        return acc
      },
      { successful: [], failed: [] }
    )

    logger.info({
      message: `Transformed ${successful.length}/${submissionIds.size} ${type} form submissions (${failed.length} failed)`
    })

    return successful
  }

  insertOrganisation = (item) => {
    return this.organisationsRepository
      .insert(removeUndefinedValues(item.value))
      .then(() => ({
        success: true,
        id: item.value.id,
        action: 'inserted'
      }))
      .catch((error) => {
        logger.error({
          error,
          message: 'Error inserting organisation',
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
            reference: item.value.id
          }
        })
        return {
          success: false,
          id: item.value.id,
          phase: 'insert'
        }
      })
  }

  updateOrganisation = (item) => {
    const { id, version, ...orgWithoutIdAndVersion } = item.value
    return this.organisationsRepository
      .update(id, version, removeUndefinedValues(orgWithoutIdAndVersion))
      .then(() => ({
        success: true,
        id,
        action: 'updated'
      }))
      .catch((error) => {
        logger.error({
          error,
          message: 'Error updating organisation',
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
            reference: id
          }
        })
        return {
          success: false,
          id,
          phase: 'update'
        }
      })
  }

  /**
   * Upserts organisations to the database in parallel
   *
   * Partitions organisations into inserts and updates, then processes both
   * sets concurrently using Promise.allSettled for optimal performance
   *
   * @param {OrganisationMigrationItem[]} organisations - Organisations to upsert with their operation type
   * @returns {Promise<void>}
   */
  async upsertOrganisations(organisations) {
    const toInsert = organisations.filter((item) => item.operation === 'insert')
    const toUpdate = organisations.filter((item) => item.operation === 'update')

    const insertPromises = toInsert.map(this.insertOrganisation)
    const updatePromises = toUpdate.map(this.updateOrganisation)

    const results = await Promise.allSettled([
      ...insertPromises,
      ...updatePromises
    ])
    const { successful, failed } = this.partitionResults(results)

    const insertedCount = successful.filter(
      (r) => r.action === 'inserted'
    ).length
    const updatedCount = successful.filter((r) => r.action === 'updated').length

    logger.info({
      message: `Migration completed: ${successful.length}/${organisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${failed.length} failed)`
    })
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

  /**
   * Fetches existing organisations that have new registrations or accreditations to migrate
   *
   * Identifies organisations that already exist in the database but have new form
   * submissions (registrations/accreditations) that need to be linked to them.
   * Fetches all matching organisations in parallel using Promise.all for performance.
   *
   * @param {import('#repositories/organisations/port.js').OrganisationIds} migratedSubmissionIds - IDs of already migrated submissions
   * @param {Array} registrationsToMigrate - New registration submissions to migrate
   * @param {Array} accreditationsToMigrate - New accreditation submissions to migrate
   * @returns {Promise<Map<string, Object>>} Map of organisation ID to organisation object
   */
  async fetchExistingOrganisationsWithSubmissionsToMigrate(
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
    /** @type {BaseOrganisation[]} */
    const baseOrganisations = await this.fetchAndTransform(
      submissionsToMigrate.organisations,
      'organisation'
    )

    const registrationsToMigrate = await this.fetchAndTransform(
      submissionsToMigrate.registrations,
      'registration'
    )

    const accreditationsToMigrate = await this.fetchAndTransform(
      submissionsToMigrate.accreditations,
      'accreditation'
    )

    const exitingOrgsWithSubmissionsToMigrate =
      await this.fetchExistingOrganisationsWithSubmissionsToMigrate(
        migratedSubmissionIds,
        registrationsToMigrate,
        accreditationsToMigrate
      )

    const allOrganisationsToMigrate = baseOrganisations.concat(
      ...exitingOrgsWithSubmissionsToMigrate.values()
    )

    /** @type {OrganisationWithRegistrations[]} */
    const organisationsWithRegistrations = this.linkRegistrations(
      allOrganisationsToMigrate,
      registrationsToMigrate
    )

    /** @type {Organisation[]} */
    const organisationsWithAccreditations = this.linkAccreditations(
      organisationsWithRegistrations,
      accreditationsToMigrate
    )

    return linkRegistrationToAccreditations(organisationsWithAccreditations)
  }

  hasNoSubmissionsToMigrate(submissionsToMigrate) {
    const countOfSubmissionsToMigrate =
      submissionsToMigrate.organisations.size +
      submissionsToMigrate.registrations.size +
      submissionsToMigrate.accreditations.size
    return countOfSubmissionsToMigrate === 0
  }

  async migrate() {
    const migratedSubmissionIds =
      await this.organisationsRepository.findAllIds()
    const submissionsToMigrate = await this.getSubmissionsToMigrate(
      migratedSubmissionIds
    )

    if (this.hasNoSubmissionsToMigrate(submissionsToMigrate)) {
      logger.info({ message: 'No new form submissions to migrate' })
      return
    }

    logger.info({
      message: `Found ${submissionsToMigrate.organisations.size} organisations, ${submissionsToMigrate.registrations.size} registrations, ${submissionsToMigrate.accreditations.size} accreditations to migrate`
    })
    const organisations = await this.transformAndLinkAllNewSubmissions(
      migratedSubmissionIds,
      submissionsToMigrate
    )
    const migrationItems = organisations.map((org) => {
      /** @type {OrganisationMigrationItem} */
      const item = {
        value: org,
        operation: submissionsToMigrate.organisations.has(org.id)
          ? 'insert'
          : 'update'
      }
      return item
    })
    await this.upsertOrganisations(migrationItems)
  }
}

/**
 * Creates a form data migrator with configured repositories
 *
 * @param {FormSubmissionsRepository} formsSubmissionRepository - Repository for form submissions
 * @param {OrganisationsRepository} organisationsRepository - Repository for organisations
 * @returns {FormDataMigrator} Migrator instance with migrate method
 *
 * @example
 * const formsDataMigration = createFormDataMigrator(formsRepo, orgsRepo)
 * await formsDataMigration.migrate()
 */
export function createFormDataMigrator(
  formsSubmissionRepository,
  organisationsRepository
) {
  const processor = new MigratorProcessor(
    formsSubmissionRepository,
    organisationsRepository
  )

  /** @type {FormDataMigrator} */
  return {
    migrate: processor.migrate.bind(processor)
  }
}
