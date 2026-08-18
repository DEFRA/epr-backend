import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildActiveOrg } from '#vite/helpers/build-active-org.js'
import {
  defraIdMockAuthTokens,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const ANOTHER_ORGANISATION_ID = 'another-organisation-id'

/**
 * Exercises who may read a waste balance ledger over the full auth stack.
 *
 * Real tokens are the point. `server.inject({ auth })` attaches credentials
 * directly, so it cannot show which scopes a caller actually earns. Only a
 * real Defra ID token shows that the operator resolver grants nothing that
 * opens a ledger, and the case that pins that down is the operator refused
 * their own organisation.
 *
 * The three operator cases are one assertion held three ways. An operator
 * earns no ledger scope in any of them, so the organisation in the request no
 * longer changes the answer. They stay because a later change to the operator
 * resolver must break all three, not one.
 *
 * The first of them also pins the shape of the route's scope array. That
 * operator holds `organisation.read` for the organisation in the path, so a
 * route that admitted either scope would answer 200. The 403 shows the ledger
 * scope is required rather than merely accepted. No identity holds the ledger
 * scope without `organisation.read`, so no case here shows the first entry is
 * enforced.
 *
 * @param {{ makeUrl: (organisationId: string) => string }} options
 */
export const testLedgerEventsAccess = ({ makeUrl }) => {
  describe('access control', () => {
    setupAuthContext()

    /** @type {import('#test/create-test-server.js').TestServer} */
    let server
    /** @type {string} */
    let organisationId

    beforeEach(async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

      server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory
        }
      })

      const organisation = await buildActiveOrg(organisationsRepository)
      organisationId = organisation.id
    })

    /**
     * @param {string} token
     * @param {string} [orgId]
     */
    const getWithToken = (token, orgId) =>
      server.inject({
        method: 'GET',
        url: makeUrl(orgId ?? organisationId),
        headers: { Authorization: `Bearer ${token}` }
      })

    it('returns 200 for a regulator standard user', async () => {
      const response = await getWithToken(entraIdMockAuthTokens.regulatorToken)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a service maintainer', async () => {
      const response = await getWithToken(entraIdMockAuthTokens.validToken)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a read-only service maintainer', async () => {
      const response = await getWithToken(
        entraIdMockAuthTokens.readOnlyMaintainerToken
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for the support tier, the narrowest admin bundle', async () => {
      const response = await getWithToken(entraIdMockAuthTokens.supportToken)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 403 for an operator who holds organisation.read for the organisation in the path but no ledger scope', async () => {
      const response = await getWithToken(defraIdMockAuthTokens.validToken)

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 for an operator asked for an organisation that is not their own', async () => {
      const response = await getWithToken(
        defraIdMockAuthTokens.validToken,
        ANOTHER_ORGANISATION_ID
      )

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 for an operator linked to no organisation in the service', async () => {
      const response = await getWithToken(
        generateValidTokenWith({
          currentRelationshipId: 'org-relationship-id',
          relationships: [
            'org-relationship-id:company-002:another-company-name'
          ]
        })
      )

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: makeUrl(organisationId)
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })
}
