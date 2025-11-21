import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { logger } from '#common/helpers/logging/logger.js'
import { removeUndefinedValues } from '#formsubmission/parsing-common/transform-utils.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { linkItemsToOrganisations } from '#formsubmission/link-form-submissions.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { parseAccreditationSubmission } from '#formsubmission/accreditation/transform-accreditation.js'

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

async function upsertOrganisations(
  organisationsWithAccreditations,
  organisationsRepository,
  transformedOrganisations
) {
  const migrationPromises = organisationsWithAccreditations.map(
    (transformedOrganisation) => {
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
    }
  )

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
    message: `Migration completed: ${successful.length}/${transformedOrganisations.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${failed.length} failed)`
  })
}

/**
 * Migrates form submission data to organisations collection
 * @async
 * @param {import('#repositories/form-submissions/port.js').FormSubmissionsRepository} formsSubmissionRepository - Repository for form submissions
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository - Repository for organisations
 * @returns {Promise<void>}
 */
export async function migrateFormsData(
  formsSubmissionRepository,
  organisationsRepository
) {
  const transformedOrganisations = await fetchAndTransformSubmissions({
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

  const organisationsWithRegistrations = linkRegistrations(
    transformedOrganisations,
    transformedRegistrations
  )

  const transformedAccreditations = await fetchAndTransformSubmissions({
    repository: formsSubmissionRepository,
    fetchMethod: 'findAllAccreditations',
    parseFunction: parseAccreditationSubmission,
    submissionType: 'accreditation'
  })

  const organisationsWithAccreditations = linkAccreditations(
    organisationsWithRegistrations,
    transformedAccreditations
  )
  await upsertOrganisations(
    organisationsWithAccreditations,
    organisationsRepository,
    transformedOrganisations
  )
}

function linkRegistrations(organisations, registrations) {
  return linkItemsToOrganisations(organisations, registrations, 'registrations')
}

function linkAccreditations(organisations, registrations) {
  return linkItemsToOrganisations(
    organisations,
    registrations,
    'accreditations'
  )
}
