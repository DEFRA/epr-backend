import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'

const BASIC_AUTH_USERNAME = 'reg-accred'
const BASIC_AUTH_PASSWORD = 'changeme'

const encodedBasicAuthCredentials = Buffer.from(
  `${BASIC_AUTH_USERNAME}:${BASIC_AUTH_PASSWORD}`
).toString('base64')

export const basicAuthHeaders = {
  Authorization: `Basic ${encodedBasicAuthCredentials}`
}

const grantedStatusHistory = [
  {
    status: ACCREDITATION_STATUS.CREATED,
    updatedAt: new Date('2025-08-20T00:00:00.000Z')
  },
  {
    status: ACCREDITATION_STATUS.APPROVED,
    updatedAt: new Date('2026-01-10T00:00:00.000Z')
  }
]

/**
 * An approved 2026 accreditation, the registration that links to it, and a
 * registered-only registration beside them, all under one organisation.
 *
 * @param {{ accreditationNumber?: string }} [options]
 */
export const buildAccreditedOrganisation = ({
  accreditationNumber = 'A26SR5120384065PA'
} = {}) => {
  const accreditation = buildAccreditation({
    accreditationNumber,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    statusHistory: grantedStatusHistory
  })
  const registration = buildRegistration({ accreditationId: accreditation.id })
  const registeredOnly = buildRegistration({ accreditationId: undefined })
  const organisation = buildOrganisation({
    registrations: [registration, registeredOnly],
    accreditations: [accreditation]
  })

  return { organisation, registration, registeredOnly, accreditation }
}

/**
 * @param {Array<ReturnType<typeof buildOrganisation>>} organisations
 */
export const startServer = (organisations) =>
  createTestServer({
    config: {
      basicAuth: {
        username: BASIC_AUTH_USERNAME,
        password: BASIC_AUTH_PASSWORD
      }
    },
    repositories: {
      organisationsRepository: createInMemoryOrganisationsRepository(
        /** @type {any} */ (organisations)
      )
    }
  })
