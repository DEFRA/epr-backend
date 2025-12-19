import { STATUS } from '#domain/organisations/model.js'
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

  await organisationsRepository.update(org.id, org.version, {
    status: STATUS.ACTIVE,
    linkedDefraOrganisation: linkedDefraOrg,
    registrations: org.registrations.reduce(
      (prev, registration) =>
        registration.status === STATUS.APPROVED
          ? [...prev, { ...registration, status: STATUS.ACTIVE }]
          : prev,
      []
    ),
    accreditations: org.accreditations.reduce(
      (prev, accreditation) =>
        accreditation.status === STATUS.APPROVED
          ? [...prev, { ...accreditation, status: STATUS.ACTIVE }]
          : prev,
      []
    )
  })

  return waitForVersion(organisationsRepository, org.id, INITIAL_VERSION + 1)
}
