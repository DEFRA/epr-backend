import {
  REGULATOR_ROLE,
  REGULATOR_SCOPES,
  SCOPES
} from '#common/helpers/auth/constants.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { randomUUID } from 'crypto'
import { StatusCodes } from 'http-status-codes'
import { beforeAll, describe, expect, it } from 'vitest'

import { OPERATOR_ROLE } from '#application/organisations/get-defra-user-roles.js'

const ME_PATH = '/v1/me'

/** @param {string} token */
const asBearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

describe('GET /v1/me', () => {
  setupAuthContext()

  describe('who may reach it', () => {
    /** @type {import('#test/create-test-server.js').TestServer} */
    let server

    beforeAll(async () => {
      server = await createTestServer({})
    })

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({ method: 'GET', url: ME_PATH })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('answers an Entra identity that resolves to no role at all, rather than refusing it', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        ...asBearer(entraIdMockAuthTokens.nonServiceMaintainerUserToken)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({ role: null, scopes: [] })
    })

    it('returns the resolved tier for a service maintainer', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        ...asBearer(entraIdMockAuthTokens.validToken)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: 'service_maintainer_write',
        scopes: [
          SCOPES.adminRead,
          SCOPES.adminWrite,
          SCOPES.adminDlqPurge,
          SCOPES.organisationSearch,
          SCOPES.organisationRead,
          SCOPES.wasteBalanceLedgerRead
        ]
      })
    })
  })

  describe('an operator', () => {
    it('receives the operator role and the scopes that do not depend on the request', async () => {
      const email = `hello.${randomUUID()}@example.com`
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

      // An active, linked organisation, so the operator would hold
      // organisation.read on a route that named it.
      await buildApprovedOrg(organisationsRepository, {
        users: [
          {
            fullName: 'Test User',
            email,
            roles: ['initial_user', 'standard_user']
          }
        ],
        linkedDefraOrganisation: {
          orgId: COMPANY_1_ID,
          orgName: COMPANY_1_NAME,
          linkedBy: { email, id: randomUUID() },
          linkedAt: new Date().toISOString()
        }
      })

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory
        }
      })

      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        ...asBearer(generateValidTokenWith({ email }))
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: OPERATOR_ROLE,
        scopes: [SCOPES.organisationLinkedRead, SCOPES.organisationLinkedWrite]
      })
    })

    it('does not receive organisation.read here, because this route names no organisation', async () => {
      const email = `hello.${randomUUID()}@example.com`
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

      await buildApprovedOrg(organisationsRepository, {
        users: [
          {
            fullName: 'Test User',
            email,
            roles: ['initial_user', 'standard_user']
          }
        ],
        linkedDefraOrganisation: {
          orgId: COMPANY_1_ID,
          orgName: COMPANY_1_NAME,
          linkedBy: { email, id: randomUUID() },
          linkedAt: new Date().toISOString()
        }
      })

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory
        }
      })

      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        ...asBearer(generateValidTokenWith({ email }))
      })

      const { scopes } = JSON.parse(response.payload)

      expect(scopes).not.toContain(SCOPES.organisationRead)
      expect(scopes).not.toContain(SCOPES.organisationWrite)
    })
  })

  describe('a regulator', () => {
    it('receives the regulator role and the scopes that hold for every organisation', async () => {
      const server = await createTestServer({})

      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        ...asBearer(entraIdMockAuthTokens.regulatorToken)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: REGULATOR_ROLE,
        scopes: REGULATOR_SCOPES
      })
    })
  })

  describe('the response', () => {
    it('is whatever the resolver put on the credential, unfiltered', async () => {
      const server = await createTestServer({})

      const response = await server.inject({
        method: 'GET',
        url: ME_PATH,
        auth: {
          strategy: 'access-token',
          credentials: {
            id: 'test-user-id',
            email: 'someone@example.com',
            issuer: 'test-issuer',
            role: 'a_role_this_route_has_never_heard_of',
            scope: ['a.scope.this.route.has.never.heard.of']
          }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: 'a_role_this_route_has_never_heard_of',
        scopes: ['a.scope.this.route.has.never.heard.of']
      })
    })
  })
})
