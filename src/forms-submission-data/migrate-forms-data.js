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
 * @import {BaseOrganisation, Organisation, OrganisationWithRegistrations} from './types.js'
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

  async fetchAndTransform(submissionIds, type) {
    const { fetch, parse } = this.fetchTransformConfigs[type]
    const results = []
    let failureCount = 0

    for (const id of submissionIds) {
      try {
        const submission = await fetch(id)
        results.push(parse(submission))
      } catch (error) {
        failureCount++
        logger.error({
          error,
          message: `Error transforming ${type} submission`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
            reference: id
          }
        })
      }
    }

    logger.info({
      message: `Transformed ${results.length}/${submissionIds.size} ${type} form submissions (${failureCount} failed)`
    })

    return results
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

    return [...existingOrganisationsWithNewSubmissions].reduce(
      async (accPromise, orgId) => {
        const acc = await accPromise
        const org = await this.organisationsRepository.findById(orgId)
        acc.set(orgId, org)
        return acc
      },
      Promise.resolve(new Map())
    )
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
      return {
        value: org,
        operation: submissionsToMigrate.organisations.has(org.id)
          ? 'insert'
          : 'update'
      }
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
