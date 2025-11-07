import { parseOrgSubmission } from './transform-organisation-data.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Migrates form submission data to organisations collection
 * @async
 * @param {import('#repositories/form-submissions/port.js').FormSubmissionsRepository} formsSubmissionRepository - Repository for form submissions
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository - Repository for organisations
 * @returns {Promise<{totalSubmissions: number, transformedCount: number, insertedCount: number, updatedCount: number, unchangedCount: number}>} Migration statistics
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
          .upsert(transformedOrg)
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

  const successful = results.filter((result) => result.success === true)
  const failedCount = results.filter(
    (result) => result.success === false
  ).length

  const insertedCount = successful.filter((r) => r.action === 'inserted').length
  const updatedCount = successful.filter((r) => r.action === 'updated').length
  const unchangedCount = successful.filter(
    (r) => r.action === 'unchanged'
  ).length

  logger.info(
    `Migration completed: ${successful.length}/${submissions.length} organisations processed (${insertedCount} inserted, ${updatedCount} updated, ${unchangedCount} unchanged, ${failedCount} failed)`
  )

  return {
    totalSubmissions: submissions.length,
    transformedCount: results.filter((r) => r.phase !== 'transform').length,
    insertedCount,
    updatedCount,
    unchangedCount,
    failedCount
  }
}
