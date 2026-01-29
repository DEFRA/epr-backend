/**
 * @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 */
import { config } from '#root/config.js'

const SKIP_TEST_ORG_IDS = config.get('skipTransformingTestOrganisations')
/**
 * @param {FormSubmissionsRepository} formsSubmissionRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @returns {Promise<import('#formsubmission/types.js').MigrationDelta>}
 */
export async function getSubmissionsToMigrate(
  formsSubmissionRepository,
  organisationsRepository
) {
  const migratedIds = await organisationsRepository.findAllIds()
  const submissionIds =
    await formsSubmissionRepository.findAllFormSubmissionIds()

  const submittedOrganisationIds = new Set(
    [...submissionIds.organisations].filter(
      (orgId) => !SKIP_TEST_ORG_IDS.includes(orgId)
    )
  )
  const pendingOrgs = submittedOrganisationIds.difference(
    migratedIds.organisations
  )

  const pendingRegs = submissionIds.registrations.difference(
    migratedIds.registrations
  )
  const pendingAccrs = submissionIds.accreditations.difference(
    migratedIds.accreditations
  )

  return {
    migrated: {
      organisations: migratedIds.organisations,
      registrations: migratedIds.registrations,
      accreditations: migratedIds.accreditations,
      totalCount:
        migratedIds.organisations.size +
        migratedIds.registrations.size +
        migratedIds.accreditations.size
    },
    pendingMigration: {
      organisations: pendingOrgs,
      registrations: pendingRegs,
      accreditations: pendingAccrs,
      totalCount: pendingOrgs.size + pendingRegs.size + pendingAccrs.size
    }
  }
}
