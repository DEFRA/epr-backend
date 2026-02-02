import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import { parseAccreditationSubmission } from '#formsubmission/accreditation/transform-accreditation.js'
import { parseOrgSubmission } from '#formsubmission/organisation/transform-organisation.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'

/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 */

const TRANSFORMATION_CONFIG = {
  organisation: {
    fetchMethod: 'findOrganisationById',
    parse: (s) => parseOrgSubmission(s.id, s.orgId, s.rawSubmissionData)
  },
  registration: {
    fetchMethod: 'findRegistrationById',
    parse: (s) => parseRegistrationSubmission(s.id, s.rawSubmissionData)
  },
  accreditation: {
    fetchMethod: 'findAccreditationById',
    parse: (s) => parseAccreditationSubmission(s.id, s.rawSubmissionData)
  }
}

function partitionBySuccess(results, type) {
  return results.reduce(
    (acc, result) => {
      if (result.success) {
        acc.successful.push(...result.value)
      } else {
        acc.failed.push(result)
        logger.error({
          err: result.error,
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
}

async function fetchAndTransform(
  formsSubmissionRepository,
  submissionIds,
  type
) {
  const config = TRANSFORMATION_CONFIG[type]
  const fetch = (id) => formsSubmissionRepository[config.fetchMethod](id)
  const promises = [...submissionIds].map((id) =>
    fetch(id)
      .then(config.parse)
      .then((value) => ({ success: true, value }))
      .catch((error) => ({ success: false, error, id }))
  )

  const results = await Promise.all(promises)
  const { successful, failed } = partitionBySuccess(results, type)

  const transformedCount = submissionIds.size - failed.length
  logger.info({
    message: `Transformed ${transformedCount}/${submissionIds.size} ${type} form submissions (${failed.length} failed)`
  })

  return successful
}

/**
 * @param {FormSubmissionsRepository} formsSubmissionRepository
 * @param {import('#repositories/form-submissions/port.js').FormSubmissionIds} submissionsToMigrate
 * @returns {Promise<import('#formsubmission/types.js').TransformedSubmissions>}
 */
export async function transformAll(
  formsSubmissionRepository,
  submissionsToMigrate
) {
  const [organisations, registrations, accreditations] = await Promise.all([
    fetchAndTransform(
      formsSubmissionRepository,
      submissionsToMigrate.organisations,
      'organisation'
    ),
    fetchAndTransform(
      formsSubmissionRepository,
      submissionsToMigrate.registrations,
      'registration'
    ),
    fetchAndTransform(
      formsSubmissionRepository,
      submissionsToMigrate.accreditations,
      'accreditation'
    )
  ])

  return {
    organisations,
    registrations,
    accreditations
  }
}
