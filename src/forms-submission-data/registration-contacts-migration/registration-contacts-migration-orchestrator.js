import { logger } from '#common/helpers/logging/logger.js'
import { auditRegistrationContactsMigration } from '#auditing/registration-contacts-migration.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { CURRENT_SCHEMA_VERSION } from '#repositories/organisations/schema/helpers.js'

/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

async function migrateRegistration(formSubmissionsRepository, reg, orgId) {
  const submissionId = reg.formSubmission.id
  const submission =
    await formSubmissionsRepository.findRegistrationById(submissionId)

  if (!submission) {
    logger.warn({
      message: `No form submission found for registration ${reg.id} (formSubmission.id ${submissionId}) in org ${orgId}`
    })
    return reg
  }

  const [
    { submitterContactDetails, approvedPersons, applicationContactDetails }
  ] = parseRegistrationSubmission(submission.id, submission.rawSubmissionData)
  return {
    ...reg,
    submitterContactDetails,
    approvedPersons,
    applicationContactDetails
  }
}

async function migrateOrg(
  formSubmissionsRepository,
  organisationsRepository,
  systemLogsRepository,
  org,
  enabled
) {
  const updatedRegistrations = await Promise.all(
    org.registrations.map((reg) =>
      migrateRegistration(formSubmissionsRepository, reg, org.id)
    )
  )
  const prefix = enabled ? '' : '[DRY RUN] '
  if (enabled) {
    const { id, version, ...orgWithoutIdVersion } = org
    await organisationsRepository.replace(id, version, {
      ...orgWithoutIdVersion,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      registrations: updatedRegistrations
    })
    const next = await organisationsRepository.findById(org.id, org.version + 1)
    await auditRegistrationContactsMigration(
      systemLogsRepository,
      org.id,
      org,
      next
    )
  }
  logger.info({
    message: `${prefix}Org ${org.id} re-migrated: ${updatedRegistrations.length}/${org.registrations.length} registration(s) updated`
  })
  return updatedRegistrations.length
}

export class RegistrationContactsMigrationOrchestrator {
  /**
   * @param {FormSubmissionsRepository} formSubmissionsRepository
   * @param {OrganisationsRepository} organisationsRepository
   * @param {SystemLogsRepository} systemLogsRepository
   */
  constructor(
    formSubmissionsRepository,
    organisationsRepository,
    systemLogsRepository
  ) {
    this.formSubmissionsRepository = formSubmissionsRepository
    this.organisationsRepository = organisationsRepository
    this.systemLogsRepository = systemLogsRepository
  }

  async migrate(enabled) {
    const orgs = await this.organisationsRepository.findAllBySchemaVersion(2)

    if (orgs.length === 0) {
      logger.info({
        message:
          'Registration contacts migration complete: 0 orgs succeeded, 0 failed, 0 total registrations updated'
      })
      return
    }

    const prefix = enabled ? '' : '[DRY RUN] '
    let succeededOrgs = 0
    let failedOrgs = 0
    let succeededRegs = 0

    for (const org of orgs) {
      try {
        succeededRegs += await migrateOrg(
          this.formSubmissionsRepository,
          this.organisationsRepository,
          this.systemLogsRepository,
          org,
          enabled
        )
        succeededOrgs++
      } catch (error) {
        logger.error({
          err: error,
          message: `${prefix}Failed to re-migrate org ${org.id} — skipping`
        })
        failedOrgs++
      }
    }

    logger.info({
      message: `${prefix}Registration contacts migration complete: ${succeededOrgs} orgs succeeded, ${failedOrgs} failed, ${succeededRegs} total registrations updated`
    })
  }
}
