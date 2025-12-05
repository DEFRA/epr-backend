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

  async function getSubmissionsToMigrate(migratedSubmissionIds) {
    const submissionIds =
      await formsSubmissionRepository.findAllFormSubmissionIds()
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

  const insertOrganisation = (item) => {
    return organisationsRepository
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

  const updateOrganisation = (item) => {
    const { id, version, ...orgWithoutIdAndVersion } = item.value
    return organisationsRepository
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

  async function upsertOrganisations(organisations) {
    const toInsert = organisations.filter((item) => item.operation === 'insert')
    const toUpdate = organisations.filter((item) => item.operation === 'update')

    const insertPromises = toInsert.map(insertOrganisation)
    const updatePromises = toUpdate.map(updateOrganisation)

    const results = await Promise.allSettled([
      ...insertPromises,
      ...updatePromises
    ])
    const { successful, failed } = partitionResults(results)

    const insertedCount = successful.filter(
      (r) => r.action === 'inserted'
    ).length
    const updatedCount = successful.filter((r) => r.action === 'updated').length

    logger.info({
      message: `Migration completed: ${successful.length}/${organisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${failed.length} failed)`
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

  async function fetchExistingOrganisationsWithSubmissionsToMigrate(
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
        const org = await organisationsRepository.findById(orgId)
        acc.set(orgId, org)
        return acc
      },
      Promise.resolve(new Map())
    )
  }

  async function transformAndLinkAllNewSubmissions(
    migratedSubmissionIds,
    submissionsToMigrate
  ) {
    /** @type {BaseOrganisation[]} */
    const baseOrganisations = await fetchAndTransform(
      submissionsToMigrate.organisations,
      'organisation'
    )

    const registrationsToMigrate = await fetchAndTransform(
      submissionsToMigrate.registrations,
      'registration'
    )

    const accreditationsToMigrate = await fetchAndTransform(
      submissionsToMigrate.accreditations,
      'accreditation'
    )

    const exitingOrgsWithSubmissionsToMigrate =
      await fetchExistingOrganisationsWithSubmissionsToMigrate(
        migratedSubmissionIds,
        registrationsToMigrate,
        accreditationsToMigrate
      )

    const allOrganisationsToMigrate = baseOrganisations.concat(
      ...exitingOrgsWithSubmissionsToMigrate.values()
    )

    /** @type {OrganisationWithRegistrations[]} */
    const organisationsWithRegistrations = linkRegistrations(
      allOrganisationsToMigrate,
      registrationsToMigrate
    )

    /** @type {Organisation[]} */
    const organisationsWithAccreditations = linkAccreditations(
      organisationsWithRegistrations,
      accreditationsToMigrate
    )

    return linkRegistrationToAccreditations(organisationsWithAccreditations)
  }

  const hasNoSubmissionsToMigrate = (submissionsToMigrate) => {
    const countOfSubmissionsToMigrate =
      submissionsToMigrate.organisations.size +
      submissionsToMigrate.registrations.size +
      submissionsToMigrate.accreditations.size
    return countOfSubmissionsToMigrate === 0
  }

  return {
    async migrate() {
      const migratedSubmissionIds = await organisationsRepository.findAllIds()
      const submissionsToMigrate = await getSubmissionsToMigrate(
        migratedSubmissionIds
      )

      if (hasNoSubmissionsToMigrate(submissionsToMigrate)) {
        logger.info({ message: 'No new form submissions to migrate' })
        return
      }

      logger.info({
        message: `Found ${submissionsToMigrate.organisations.size} organisations, ${submissionsToMigrate.registrations.size} registrations, ${submissionsToMigrate.accreditations.size} accreditations to migrate`
      })
      const organisations = await transformAndLinkAllNewSubmissions(
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
      await upsertOrganisations(migrationItems)
    }
  }
}
