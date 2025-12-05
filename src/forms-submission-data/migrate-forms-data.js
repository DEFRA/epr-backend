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
  /**
   * Type predicate to narrow MigrationResult to SuccessResult
   * @param {MigrationResult} result
   * @returns {result is SuccessResult}
   */
  const isSuccessResult = (result) => {
    return result.success === true
  }

  /**
   * Partitions Promise.allSettled results into successful and failed arrays
   * @param {PromiseSettledResult<MigrationResult>[]} results
   * @returns {{successful: SuccessResult[], failed: FailureResult[]}}
   */
  const partitionResults = (results) => {
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value)
      .reduce(
        (acc, result) => {
          const target = isSuccessResult(result) ? acc.successful : acc.failed
          target.push(result)
          return acc
        },
        { successful: [], failed: [] }
      )
  }

  async function getUnmigratedSubmissionIds() {
    const migratedIds = await organisationsRepository.findAllIds()
    const submissionIds =
      await formsSubmissionRepository.findAllFormSubmissionIds()
    return {
      organisations: submissionIds.organisations.difference(
        migratedIds.organisations
      ),
      registrations: submissionIds.registrations.difference(
        migratedIds.registrations
      ),
      accreditations: submissionIds.accreditations.difference(
        migratedIds.accreditations
      )
    }
  }

  const fetchTransformConfigs = {
    organisation: {
      fetch: (id) => formsSubmissionRepository.findOrganisationById(id),
      parse: (s) => parseOrgSubmission(s.id, s.orgId, s.rawSubmissionData)
    },
    registration: {
      fetch: (id) => formsSubmissionRepository.findRegistrationById(id),
      parse: (s) => parseRegistrationSubmission(s.id, s.rawSubmissionData)
    },
    accreditation: {
      fetch: (id) => formsSubmissionRepository.findAccreditationById(id),
      parse: (s) => parseAccreditationSubmission(s.id, s.rawSubmissionData)
    }
  }

  async function fetchAndTransform(submissionIds, type) {
    const { fetch, parse } = fetchTransformConfigs[type]
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

  async function upsertOrganisations(organisations) {
    const migrationPromises = organisations.map((transformedOrganisation) => {
      return organisationsRepository
        .upsert(removeUndefinedValues(transformedOrganisation))
        .then((result) => ({
          success: true,
          id: transformedOrganisation.id,
          action: result.action
        }))
        .catch((error) => {
          logger.error({
            error,
            message: 'Error upserting organisation',
            event: {
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: transformedOrganisation.id
            }
          })
          return {
            success: false,
            id: transformedOrganisation.id,
            phase: 'upsert'
          }
        })
    })

    const results = await Promise.allSettled(migrationPromises)
    const { successful, failed } = partitionResults(results)

    const insertedCount = successful.filter(
      (r) => r.action === 'inserted'
    ).length
    const updatedCount = successful.filter((r) => r.action === 'updated').length
    const unchangedCount = successful.filter(
      (r) => r.action === 'unchanged'
    ).length

    logger.info({
      message: `Migration completed: ${successful.length}/${organisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${failed.length} failed)`
    })
  }

  const linkRegistrations = (organisations, registrations) => {
    return linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations',
      systemReferencesRequiringOrgIdMatch()
    )
  }

  const linkAccreditations = (organisations, accreditations) => {
    return linkItemsToOrganisations(
      organisations,
      accreditations,
      'accreditations',
      systemReferencesRequiringOrgIdMatch()
    )
  }

  return {
    async migrate() {
      const unmigratedSubmissionIds = await getUnmigratedSubmissionIds()

      /** @type {BaseOrganisation[]} */
      const baseOrganisations = await fetchAndTransform(
        unmigratedSubmissionIds.organisations,
        'organisation'
      )

      const transformedRegistrations = await fetchAndTransform(
        unmigratedSubmissionIds.registrations,
        'registration'
      )

      /** @type {OrganisationWithRegistrations[]} */
      const organisationsWithRegistrations = linkRegistrations(
        baseOrganisations,
        transformedRegistrations
      )

      const transformedAccreditations = await fetchAndTransform(
        unmigratedSubmissionIds.accreditations,
        'accreditation'
      )

      /** @type {Organisation[]} */
      const organisationsWithAccreditations = linkAccreditations(
        organisationsWithRegistrations,
        transformedAccreditations
      )

      const organisations = linkRegistrationToAccreditations(
        organisationsWithAccreditations
      )

      await upsertOrganisations(organisations)
    }
  }
}
