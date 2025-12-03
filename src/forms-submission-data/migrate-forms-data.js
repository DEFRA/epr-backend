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
import { systemReferencesRequiringOrgIdMatch } from '#formsubmission/overrides/override.js'

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
 * @typedef {Object} MigrationStatistics
 * @property {number} totalSubmissions
 * @property {number} transformedCount
 * @property {number} insertedCount
 * @property {number} updatedCount
 * @property {number} unchangedCount
 * @property {number} failedCount
 */

/**
 * Type predicate to narrow MigrationResult to SuccessResult
 * @param {MigrationResult} result
 * @returns {result is SuccessResult}
 */
function isSuccessResult(result) {
  return result.success === true
}

/**
 * Type predicate to narrow MigrationResult to FailureResult
 * @param {MigrationResult} result
 * @returns {result is FailureResult}
 */
function isFailureResult(result) {
  return result.success === false
}

async function fetchAndTransformSubmissions({
  repository,
  fetchMethod,
  parseFunction,
  submissionType,
  extractParams = (submission) => [submission.id, submission.rawSubmissionData]
}) {
  const submissions = await repository[fetchMethod]()
  let failureCount = 0

  const results = submissions.flatMap((submission) => {
    const { id } = submission
    try {
      const params = extractParams(submission)
      return [parseFunction(...params)]
    } catch (error) {
      failureCount++
      logger.error({
        error,
        message: `Error transforming ${submissionType} submission`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: id
        }
      })
      return []
    }
  })

  logger.info({
    message: `Transformed ${results.length}/${submissions.length} ${submissionType} form submissions (${failureCount} failed)`
  })

  return results
}

async function upsertOrganisations(organisations, organisationsRepository) {
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

  const successful = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter(isSuccessResult)
  const failed = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter(isFailureResult)

  const insertedCount = successful.filter((r) => r.action === 'inserted').length
  const updatedCount = successful.filter((r) => r.action === 'updated').length
  const unchangedCount = successful.filter(
    (r) => r.action === 'unchanged'
  ).length

  logger.info({
    message: `Migration completed: ${successful.length}/${organisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${failed.length} failed)`
  })
}

/**
 * Migrates form submission data to organisations collection
 *
 * @param {FormSubmissionsRepository} formsSubmissionRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {Promise<void>}
 */
export async function migrateFormsData(
  formsSubmissionRepository,
  organisationsRepository
) {
  /** @type {BaseOrganisation[]} */
  const baseOrganisations = await fetchAndTransformSubmissions({
    repository: formsSubmissionRepository,
    fetchMethod: 'findAllOrganisations',
    parseFunction: parseOrgSubmission,
    submissionType: 'organisation',
    extractParams: (submission) => [
      submission.id,
      submission.orgId,
      submission.rawSubmissionData
    ]
  })

  const transformedRegistrations = await fetchAndTransformSubmissions({
    repository: formsSubmissionRepository,
    fetchMethod: 'findAllRegistrations',
    parseFunction: parseRegistrationSubmission,
    submissionType: 'registration'
  })

  /** @type {OrganisationWithRegistrations[]} */
  const organisationsWithRegistrations = linkRegistrations(
    baseOrganisations,
    transformedRegistrations
  )

  const transformedAccreditations = await fetchAndTransformSubmissions({
    repository: formsSubmissionRepository,
    fetchMethod: 'findAllAccreditations',
    parseFunction: parseAccreditationSubmission,
    submissionType: 'accreditation'
  })

  /** @type {Organisation[]} */
  const organisationsWithAccreditations = linkAccreditations(
    organisationsWithRegistrations,
    transformedAccreditations
  )

  const organisations = linkRegistrationToAccreditations(
    organisationsWithAccreditations
  )

  await upsertOrganisations(organisations, organisationsRepository)
}

function linkRegistrations(organisations, registrations) {
  return linkItemsToOrganisations(
    organisations,
    registrations,
    'registrations',
    systemReferencesRequiringOrgIdMatch()
  )
}

function linkAccreditations(organisations, accreditations) {
  return linkItemsToOrganisations(
    organisations,
    accreditations,
    'accreditations',
    systemReferencesRequiringOrgIdMatch()
  )
}
