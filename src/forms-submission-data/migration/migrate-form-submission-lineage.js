import { logger } from '#common/helpers/logging/logger.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'
import { auditFormSubmissionLineageMigration } from '#root/auditing/form-submission-lineage-migration.js'

/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const MIGRATION_SCHEMA_VERSION = 2

function isGlassOther(item) {
  return (
    item.material === MATERIAL.GLASS &&
    item.glassRecyclingProcess?.length === 1 &&
    item.glassRecyclingProcess[0] === GLASS_RECYCLING_PROCESS.GLASS_OTHER
  )
}

/**
 * Resolve formSubmission for a registration or accreditation.
 *
 * @param {object} item
 * @param {object[]} siblings - All items of the same type in the same org
 * @param {string} orgId - org Id
 * @param {(id: string) => Promise<object|null>} findById
 * @param {string} itemType - 'registration' or 'accreditation' (used in log messages)
 * @returns {Promise<{id: string, time: Date}>}
 */
async function resolveFormSubmission(
  item,
  orgId,
  siblings,
  findById,
  itemType
) {
  const found = await findById(item.id)

  if (found) {
    return { id: item.id, time: item.formSubmissionTime }
  }

  if (isGlassOther(item)) {
    const sibling = siblings.find(
      (s) =>
        s.id !== item.id &&
        s.material === MATERIAL.GLASS &&
        s.glassRecyclingProcess?.includes(
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
        ) &&
        s.formSubmissionTime?.getTime() === item.formSubmissionTime?.getTime()
    )

    if (sibling) {
      return { id: sibling.id, time: item.formSubmissionTime }
    }

    logger.error({
      message: `migrate-form-submission-lineage: no sibling remelt found for glass-other ${itemType} ${item.id} , org id: ${orgId}`
    })
  } else {
    logger.error({
      message: `migrate-form-submission-lineage: no form submission found for ${itemType} ${item.id}, org id :${orgId}`
    })
  }

  return { id: item.id, time: item.formSubmissionTime }
}

/**
 * Migrate a single organisation: backfill formSubmission on org, registrations and accreditations,
 * then replace with schemaVersion 2.
 *
 * @param {object} org
 * @param {FormSubmissionsRepository} formSubmissionsRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SystemLogsRepository} systemLogsRepository
 */
async function migrateOrganisation(
  org,
  formSubmissionsRepository,
  organisationsRepository,
  systemLogsRepository
) {
  const orgFormSubmission = {
    id: org.id,
    time: org.formSubmissionTime
  }

  const registrations = org.registrations
  const accreditations = org.accreditations

  const updatedRegistrations = await Promise.all(
    registrations.map(async (reg) => {
      const { formSubmissionTime: _regTime, ...regWithoutFormSubmissionTime } =
        reg
      return {
        ...regWithoutFormSubmissionTime,
        formSubmission: await resolveFormSubmission(
          reg,
          org.id,
          registrations,
          (registrationId) =>
            formSubmissionsRepository.findRegistrationById(registrationId),
          'registration'
        )
      }
    })
  )

  const updatedAccreditations = await Promise.all(
    accreditations.map(async (acc) => {
      const { formSubmissionTime: _accTime, ...accWithoutFormSubmissionTime } =
        acc
      return {
        ...accWithoutFormSubmissionTime,
        formSubmission: await resolveFormSubmission(
          acc,
          org.id,
          accreditations,
          (accreditationId) =>
            formSubmissionsRepository.findAccreditationById(accreditationId),
          'accreditation'
        )
      }
    })
  )

  const {
    id,
    version,
    formSubmissionTime: _orgTime,
    ...orgWithoutIdAndVersionTime
  } = org

  await organisationsRepository.replace(id, version, {
    ...orgWithoutIdAndVersionTime,
    formSubmission: orgFormSubmission,
    registrations: updatedRegistrations,
    accreditations: updatedAccreditations,
    schemaVersion: MIGRATION_SCHEMA_VERSION
  })

  const next = await organisationsRepository.findById(id, version + 1)

  await auditFormSubmissionLineageMigration(
    systemLogsRepository,
    org.id,
    org,
    next
  )
}

/**
 * Backfill formSubmission lineage on all organisations at schemaVersion 1.
 *
 * @param {FormSubmissionsRepository} formSubmissionsRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @param {SystemLogsRepository} systemLogsRepository
 * @returns {Promise<void>}
 */
export async function migrateFormSubmissionLineage(
  formSubmissionsRepository,
  organisationsRepository,
  systemLogsRepository
) {
  const orgs = await organisationsRepository.findAllBySchemaVersion(1)

  if (orgs.length === 0) {
    logger.info({
      message: 'migrate-form-submission-lineage: no organisations to migrate'
    })
    return
  }

  logger.info({
    message: `migrate-form-submission-lineage: migrating ${orgs.length} organisation(s)`
  })

  let succeeded = 0
  let failed = 0

  for (const org of orgs) {
    try {
      await migrateOrganisation(
        org,
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )
      succeeded++
    } catch (error) {
      failed++
      logger.error({
        err: error,
        message: `migrate-form-submission-lineage: failed to migrate organisation ${org.id}`
      })
    }
  }

  logger.info({
    message: `migrate-form-submission-lineage: completed — ${succeeded} succeeded, ${failed} failed`
  })
}
