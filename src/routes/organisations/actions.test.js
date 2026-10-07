import crypto from 'node:crypto'

import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildActiveOrg } from '#vite/helpers/build-active-org.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import {
  defraIdMockAuthTokens,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { TestServer } from '#test/create-test-server.js' */

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const UNKNOWN_ORGANISATION_NUMBER = 999999
const DEFRA_ID_ORG_ID = crypto.randomUUID()

describe('organisation actions by organisation number', () => {
  setupAuthContext()

  /** @type {TestServer} */
  let server
  /** @type {OrganisationsRepository} */
  let organisationsRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        // The organisation the number resolved to is the one acted on, so
        // only a read of the write's own result reaches findById.
        organisationsRepository: () => {
          const repository = organisationsRepositoryFactory()
          return {
            ...repository,
            findById: (id, minimumVersion) =>
              minimumVersion === undefined
                ? Promise.reject(new Error('read again'))
                : repository.findById(id, minimumVersion)
          }
        },
        systemLogsRepository: createSystemLogsRepository()
      }
    })
  })

  afterEach(async () => {
    await server.stop()
  })

  describe('POST /organisations/{organisationNumber}/link', () => {
    const email = 'initial.user@email.com'
    const linkToken = generateValidTokenWith({
      email,
      currentRelationshipId: 'relationship-1',
      relationships: [`relationship-1:${DEFRA_ID_ORG_ID}:Defra ID Org Ltd`]
    })

    it('links the organisation', async () => {
      const organisation = await buildApprovedOrg(organisationsRepository, {
        submitterContactDetails: {
          fullName: 'Initial User',
          email,
          phone: '1234567890',
          jobTitle: 'Director'
        }
      })

      const response = await server.inject({
        method: 'POST',
        url: `/organisations/${organisation.orgId}/link`,
        headers: { Authorization: `Bearer ${linkToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        status: ORGANISATION_STATUS.ACTIVE,
        linkedDefraOrganisation: {
          defraOrganisation: { id: DEFRA_ID_ORG_ID, name: 'Defra ID Org Ltd' },
          linkedAt: expect.any(String),
          linkedBy: { email }
        }
      })
      const linked = await organisationsRepository.findById(
        organisation.id,
        organisation.version + 1
      )
      expect(linked.status).toBe(ORGANISATION_STATUS.ACTIVE)
      expect(linked.linkedDefraOrganisation?.orgId).toBe(DEFRA_ID_ORG_ID)
    })

    it('returns 404 for an unknown organisation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/organisations/${UNKNOWN_ORGANISATION_NUMBER}/link`,
        headers: { Authorization: `Bearer ${linkToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('PUT /organisations/{organisationNumber}/user', () => {
    const newUser = {
      contactId: 'new-user-id',
      email: 'new.user@email.com',
      firstName: 'New',
      lastName: 'Person'
    }

    it('adds the user to the organisation', async () => {
      const organisation = await buildActiveOrg(organisationsRepository)

      const response = await server.inject({
        method: 'PUT',
        url: `/organisations/${organisation.orgId}/user`,
        headers: { Authorization: `Bearer ${generateValidTokenWith(newUser)}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
      expect(response.payload).toBe('')
      const updated = await organisationsRepository.findById(
        organisation.id,
        organisation.version + 1
      )
      expect(updated.users).toContainEqual(
        expect.objectContaining({ email: newUser.email })
      )
    })

    it("refuses an operator acting on another organisation's number", async () => {
      await buildActiveOrg(organisationsRepository)
      const other = await buildApprovedOrg(organisationsRepository)

      const response = await server.inject({
        method: 'PUT',
        url: `/organisations/${other.orgId}/user`,
        headers: { Authorization: `Bearer ${defraIdMockAuthTokens.validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
