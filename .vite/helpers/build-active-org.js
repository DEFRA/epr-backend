import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { prepareOrgUpdate } from '#repositories/organisations/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { buildApprovedOrg } from './build-approved-org.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME,
  USER_PRESENT_IN_ORG1_EMAIL,
  VALID_TOKEN_CONTACT_ID
} from './create-defra-id-test-tokens.js'

export async function buildActiveOrg(organisationsRepository, overrides) {
  const org = await buildApprovedOrg(organisationsRepository, overrides)
  const INITIAL_VERSION = org.version

  const linkedDefraOrg = {
    orgId: COMPANY_1_ID,
    orgName: COMPANY_1_NAME,
    linkedBy: {
      email: USER_PRESENT_IN_ORG1_EMAIL,
      id: VALID_TOKEN_CONTACT_ID
    },
    linkedAt: new Date().toISOString()
  }

  await organisationsRepository.replace(
    org.id,
    INITIAL_VERSION,
    prepareOrgUpdate(org, {
      status: ORGANISATION_STATUS.ACTIVE,
      linkedDefraOrganisation: linkedDefraOrg
    })
  )

  return waitForVersion(organisationsRepository, org.id, INITIAL_VERSION + 1)
}
