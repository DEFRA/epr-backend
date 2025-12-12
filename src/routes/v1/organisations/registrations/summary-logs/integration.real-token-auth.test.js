/**
 * Real Token Authentication Integration Tests
 *
 * These tests verify that the FULL authentication flow works correctly,
 * including JWT validation, org linking checks, and cross-org access control.
 *
 * Unlike Tier 1 tests (which use asStandardUser() to bypass JWT validation)
 * and Tier 2 tests (which use the in-memory auth context adapter), these
 * tests use cryptographically valid JWT tokens and the real auth flow.
 *
 * This proves that:
 * 1. JWT signature validation works
 * 2. Token audience/issuer checks work
 * 3. Org linking is correctly checked against the token's relationships
 * 4. Cross-org access is denied at the JWT validation level
 *
 * Note: Happy path tests using real tokens exist in post.test.js (via buildActiveOrg).
 * This file specifically tests the CROSS-ORG DENIAL cases that aren't covered there.
 */

import crypto from 'node:crypto'
import { StatusCodes } from 'http-status-codes'
import { config } from '#root/config.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME,
  defraIdMockAuthTokens,
  USER_PRESENT_IN_ORG1_EMAIL,
  VALID_TOKEN_CONTACT_ID
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { validToken } = defraIdMockAuthTokens

/**
 * Creates a test organisation linked to the Defra ID token's current relationship.
 */
const createLinkedOrganisation = () =>
  buildOrganisation({
    users: [
      {
        fullName: 'Test User',
        email: USER_PRESENT_IN_ORG1_EMAIL,
        contactId: VALID_TOKEN_CONTACT_ID,
        roles: ['initial_user', 'standard_user']
      }
    ],
    linkedDefraOrganisation: {
      orgId: COMPANY_1_ID,
      orgName: COMPANY_1_NAME,
      linkedBy: {
        email: USER_PRESENT_IN_ORG1_EMAIL,
        id: VALID_TOKEN_CONTACT_ID
      },
      linkedAt: new Date().toISOString()
    }
  })

describe('Real Token Authentication - Cross-organisation access control', () => {
  setupAuthContext()

  let server
  let organisationsRepository

  beforeAll(async () => {
    config.set('featureFlags.defraIdAuth', true)

    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        summaryLogsRepository: summaryLogsRepositoryFactory
      },
      featureFlags
    })
  })

  afterAll(() => {
    config.reset('featureFlags.defraIdAuth')
  })

  describe('accessing organisation endpoints with real JWT tokens', () => {
    it('denies user access to organisation NOT linked to their Defra ID token', async () => {
      // Create an org that IS linked to the token (required for auth to work)
      const linkedOrg = createLinkedOrganisation()
      await organisationsRepository.insert(linkedOrg)

      // Create a DIFFERENT org that is NOT linked to any Defra ID
      const unlinkedOrg = buildOrganisation()
      await organisationsRepository.insert(unlinkedOrg)

      const unlinkedRegistrationId = unlinkedOrg.registrations[0].id

      // Try to access the unlinked org - should be denied
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${unlinkedOrg.id}/registrations/${unlinkedRegistrationId}/summary-logs/any-id`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      // Auth validation returns 401 because the check happens during JWT validation.
      // The message confirms the cross-org access denial is working.
      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(JSON.parse(response.payload).message).toBe(
        'Access denied: organisation mismatch'
      )
    })

    it('denies user access to organisation linked to a DIFFERENT Defra ID org', async () => {
      // Create an org that IS linked to the token (required for auth to work)
      const linkedOrg = createLinkedOrganisation()
      await organisationsRepository.insert(linkedOrg)

      // Create an org linked to a DIFFERENT Defra ID org
      const differentDefraOrgId = crypto.randomUUID()
      const otherLinkedOrg = buildOrganisation({
        linkedDefraOrganisation: {
          orgId: differentDefraOrgId, // Different Defra org!
          orgName: 'Other Company Ltd',
          linkedBy: {
            email: 'other@example.com',
            id: crypto.randomUUID()
          },
          linkedAt: new Date().toISOString()
        }
      })
      await organisationsRepository.insert(otherLinkedOrg)

      const otherRegistrationId = otherLinkedOrg.registrations[0].id

      // Try to access the other org - should be denied even though it's linked
      // (just to a different Defra org than ours)
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${otherLinkedOrg.id}/registrations/${otherRegistrationId}/summary-logs/any-id`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      // Auth validation returns 401 because the check happens during JWT validation.
      // The message confirms the cross-org access denial is working.
      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(JSON.parse(response.payload).message).toBe(
        'Access denied: organisation mismatch'
      )
    })
  })
})
