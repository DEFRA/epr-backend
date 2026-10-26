import Boom from '@hapi/boom'
import { randomUUID } from 'node:crypto'
import { StatusCodes } from 'http-status-codes'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi
} from 'vitest'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { createActiveOrgBuilder } from '#vite/helpers/build-active-org.js'
import {
  COMPANY_2_ID,
  defraIdMockAuthTokens,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const organisationBuilders = createOrganisationBuilders()
const { buildOrganisation } = organisationBuilders
const buildActiveOrg = createActiveOrgBuilder(organisationBuilders)

/** @import { Organisation } from '#domain/organisations/model.js' */

const mockLogger = createMockLogger()

/**
 * @param {Organisation} organisation
 * @param {number | string} year
 */
const buildUrl = (organisation, year) =>
  `/organisations/${organisation.orgId}/registrations/${organisation.registrations[0].registrationNumber}/summary-logs/${year}`

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs/{year}', () => {
  setupAuthContext()

  let server
  let uploadsRepository

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('an active registration', () => {
    /** @type {Organisation} */
    const organisation = partialMock(
      buildOrganisation({ registrations: [reprocessor()] })
    )

    beforeAll(async () => {
      uploadsRepository = createInMemoryUploadsRepository()

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () =>
            createInMemorySummaryLogsRepository()(mockLogger),
          organisationsRepository: createInMemoryOrganisationsRepository([
            organisation
          ]),
          uploadsRepository
        }
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 201 for a year the registration is active in', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 2026),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('re-throws Boom errors from the uploads repository', async () => {
      vi.spyOn(uploadsRepository, 'initiateSummaryLogUpload').mockRejectedValue(
        Boom.badGateway('CDP Uploader is down')
      )

      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 2026),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
    })

    it('wraps non-Boom errors from the uploads repository in a 500', async () => {
      vi.spyOn(uploadsRepository, 'initiateSummaryLogUpload').mockRejectedValue(
        new Error('Network failure')
      )

      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 2026),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('returns 422 for a year before the registration was approved', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 2025),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 for a non-numeric year', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 'not-a-year'),
        ...asOperator(),
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when redirectUrl is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: buildUrl(organisation, 2026),
        ...asOperator(),
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('an operator signed in with Defra ID', () => {
    /** @type {Organisation} */
    let linkedOrganisation
    /** @type {Organisation} */
    let otherOrganisation

    beforeAll(async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const repository = organisationsRepositoryFactory()
      linkedOrganisation = await buildActiveOrg(repository)
      otherOrganisation = await buildActiveOrg(repository, {
        linkedDefraOrganisation: {
          orgId: COMPANY_2_ID,
          orgName: 'Company 2 Name',
          linkedBy: {
            email: 'someone.else@example.com',
            id: '550e8400-e29b-41d4-a716-446655440002'
          },
          linkedAt: new Date().toISOString()
        }
      })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () =>
            createInMemorySummaryLogsRepository()(mockLogger),
          organisationsRepository: organisationsRepositoryFactory,
          uploadsRepository: createInMemoryUploadsRepository()
        }
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    /**
     * @param {Organisation} organisation
     * @param {string} [token]
     */
    const uploadTo = (organisation, token = defraIdMockAuthTokens.validToken) =>
      server.inject({
        method: 'POST',
        url: buildUrl(organisation, new Date().getFullYear()),
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: { redirectUrl: 'https://frontend.test/redirect' }
      })

    it('returns 201 for the organisation the operator is linked to', async () => {
      const response = await uploadTo(linkedOrganisation)

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('returns 403 for an active organisation linked to someone else', async () => {
      const response = await uploadTo(otherOrganisation)

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe('Insufficient scope')
    })

    it('returns 403 when the operator signed in for a Defra organisation linked to no organisation', async () => {
      const relationshipId = randomUUID()
      const token = generateValidTokenWith({
        currentRelationshipId: relationshipId,
        relationships: [`${relationshipId}:${randomUUID()}:Unlinked Ltd`]
      })

      const response = await uploadTo(linkedOrganisation, token)

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe('Insufficient scope')
    })

    it('returns 403, not 404, for an organisation number that does not exist', async () => {
      const response = await uploadTo({ ...linkedOrganisation, orgId: 999999 })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe('Insufficient scope')
    })
  })
})
