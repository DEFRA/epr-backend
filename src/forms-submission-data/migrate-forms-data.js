import { parseOrgSubmission } from './transform-organisation-data.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Migrates form submission data to organisations collection
 * @async
 * @param {import('#repositories/form-submissions/port.js').FormSubmissionsRepository} formsSubmissionRepository - Repository for form submissions
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository - Repository for organisations
 * @returns {Promise<{totalSubmissions: number, transformedCount: number, insertedCount: number}>} Migration statistics
 */
export async function migrateFormsData(
  formsSubmissionRepository,
  organisationsRepository
) {
  const submissions = await formsSubmissionRepository.findAll()

  const migrationPromises = submissions.map((submission) => {
    const { id, orgId, rawSubmissionData } = submission

    return parseOrgSubmission(id, orgId, rawSubmissionData)
      .then((transformedOrg) =>
        organisationsRepository
          .insert(transformedOrg)
          .then(() => ({ success: true, id }))
          .catch((error) => {
            logger.error(
              error,
              `Error inserting organisation ID ${transformedOrg.id}`
            )
            return { success: false, id, phase: 'insert' }
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

  const results = await Promise.allSettled(migrationPromises)

  const successCount = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.success === true
  ).length

  logger.info(
    `Migration completed: ${successCount}/${submissions.length} organisations migrated successfully`
  )

  return {
    totalSubmissions: submissions.length,
    transformedCount: results.filter(
      (r) => r.status === 'fulfilled' && r.value?.phase !== 'transform'
    ).length,
    insertedCount: successCount
  }
}
