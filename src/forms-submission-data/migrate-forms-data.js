import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { logger } from '#common/helpers/logging/logger.js'
import { removeUndefinedValues } from '#formsubmission/parsing-common/transform-utils.js'

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
 * Check if a result failed during transformation phase
 * @param {MigrationResult} result
 * @returns {boolean}
 */
function isTransformFailure(result) {
  return isFailureResult(result) && result.phase === 'transform'
}

/**
 * Migrates form submission data to organisations collection
 * @async
 * @param {import('#repositories/form-submissions/port.js').FormSubmissionsRepository} formsSubmissionRepository - Repository for form submissions
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository - Repository for organisations
 * @returns {Promise<MigrationStatistics>} Migration statistics
 */
export async function migrateFormsData(
  formsSubmissionRepository,
  organisationsRepository
) {
  const submissions = await formsSubmissionRepository.findAllOrganisations()

  const migrationPromises = submissions.map((submission) => {
    const { id, orgId, rawSubmissionData } = submission

    return parseOrgSubmission(id, orgId, rawSubmissionData)
      .then((transformedOrg) =>
        organisationsRepository
          .upsert(removeUndefinedValues(transformedOrg))
          .then((result) => ({
            success: true,
            id,
            action: result.action
          }))
          .catch((error) => {
            logger.error(
              error,
              `Error upserting organisation ID ${transformedOrg.id}`
            )
            return { success: false, id, phase: 'upsert' }
          })
      )
      .catch((error) => {
        logger.error(
          error,
          `Error transforming submission ID ${id}, orgId ${orgId}`
        )
        return { success: false, id, phase: 'transform' }
      })
  })

  const results = await Promise.all(migrationPromises)

  const successful = results.filter(isSuccessResult)
  const failed = results.filter(isFailureResult)
  const transformFailures = results.filter(isTransformFailure)

  const insertedCount = successful.filter((r) => r.action === 'inserted').length
  const updatedCount = successful.filter((r) => r.action === 'updated').length
  const unchangedCount = successful.filter(
    (r) => r.action === 'unchanged'
  ).length

  logger.info({
    message: `Migration completed: ${successful.length}/${submissions.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${transformFailures.length} transform failed, ${failed.length} failed)`
  })

  return {
    totalSubmissions: submissions.length,
    transformedCount: submissions.length - transformFailures.length,
    insertedCount,
    updatedCount,
    unchangedCount,
    failedCount: failed.length
  }
}
