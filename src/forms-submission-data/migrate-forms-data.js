import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { logger } from '#common/helpers/logging/logger.js'
import { removeUndefinedValues } from '#formsubmission/parsing-common/transform-utils.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { linkItemsToOrganisations } from '#formsubmission/link-form-submissions.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

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
  const orgSubmissions = await formsSubmissionRepository.findAllOrganisations()
  const registrationSubmissions =
    await formsSubmissionRepository.findAllRegistrations()

  const transformedOrganisations = transformOrgSubmissions(orgSubmissions)
  const transformedRegistrations = transformRegistrationSubmissions(
    registrationSubmissions
  )
  const organisationsWithRegistrations = linkRegistrations(
    transformedOrganisations,
    transformedRegistrations
  )

  const migrationPromises = organisationsWithRegistrations.map(
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

  const results = await Promise.all(migrationPromises)

  const successful = results.filter(isSuccessResult)
  const failed = results.filter(isFailureResult)

  const insertedCount = successful.filter((r) => r.action === 'inserted').length
  const updatedCount = successful.filter((r) => r.action === 'updated').length
  const unchangedCount = successful.filter(
    (r) => r.action === 'unchanged'
  ).length

  logger.info({
    message: `Migration completed: ${successful.length}/${orgSubmissions.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${failed.length} failed)`
  })
}

function transformOrgSubmissions(organisationFormSubmissions) {
  let failureCount = 0
  const results = organisationFormSubmissions.flatMap((submission) => {
    const { id, orgId, rawSubmissionData } = submission
    try {
      return [parseOrgSubmission(id, orgId, rawSubmissionData)]
    } catch (error) {
      failureCount++
      logger.error({
        error,
        message: 'Error transforming organisation submission',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: id
        }
      })
      return []
    }
  })

  logger.error({
    message: `Transformed ${results.length}/${organisationFormSubmissions.length} organisation form submissions (${failureCount} failed)`
  })
  return results
}

function transformRegistrationSubmissions(registrationSubmissions) {
  let failureCount = 0
  const results = registrationSubmissions.flatMap((submission) => {
    const { id, rawSubmissionData } = submission
    try {
      return [parseRegistrationSubmission(id, rawSubmissionData)]
    } catch (error) {
      failureCount++
      logger.error({
        error,
        message: 'Error transforming registration submission',
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
          reference: id
        }
      })
      return []
    }
  })

  logger.error({
    message: `Transformed ${results.length}/${registrationSubmissions.length} registration form submissions (${failureCount} failed)`
  })
  return results
}

function linkRegistrations(organisations, registrations) {
  return linkItemsToOrganisations(organisations, registrations, 'registrations')
}
