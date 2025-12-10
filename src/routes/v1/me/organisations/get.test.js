import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  defraIdMockAuthTokens,
  VALID_TOKEN_CURRENT_ORG_ID,
  VALID_TOKEN_CURRENT_RELATIONSHIP_ID
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { validToken } = defraIdMockAuthTokens

describe('GET /v1/me/organisations', () => {
  setupAuthContext()

  beforeAll(() => {
    config.set('featureFlags.defraIdAuth', true)
  })

  afterAll(() => {
    config.reset('featureFlags.defraIdAuth')
  })

  it('should return current, linked, and unlinked organisations for the user', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true
    })

    const server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })

    const userEmail = 'someone@test-company.com'
    const linkedAt = new Date().toISOString()

    // Linked organisation (has linkedDefraOrganisation matching current relationship from token)
    const linkedOrg = buildOrganisation({
      users: [
        {
          fullName: 'Test User',
          email: userEmail,
          isInitialUser: true,
          roles: ['standard_user']
        }
      ],
      linkedDefraOrganisation: {
        orgId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID,
        orgName: 'Test Company Ltd',
        linkedBy: {
          email: userEmail,
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt
      }
    })

    // Unlinked organisation (no linkedDefraOrganisation but has user in users array)
    const unlinkedOrg = buildOrganisation({
      users: [
        {
          fullName: 'Test User',
          email: userEmail,
          isInitialUser: true,
          roles: ['standard_user']
        }
      ]
    })

    // Organisation without the user (should not appear in response)
    const otherOrg = buildOrganisation({
      users: [
        {
          fullName: 'Other User',
          email: 'other@example.com',
          isInitialUser: true,
          roles: ['standard_user']
        }
      ]
    })

    await organisationsRepository.insert(linkedOrg)
    await organisationsRepository.insert(unlinkedOrg)
    await organisationsRepository.insert(otherOrg)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result).toEqual({
      organisations: {
        current: {
          id: VALID_TOKEN_CURRENT_ORG_ID,
          name: 'Test Company Ltd',
          relationshipId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID
        },
        linked: {
          id: VALID_TOKEN_CURRENT_RELATIONSHIP_ID,
          name: 'Test Company Ltd',
          linkedBy: {
            email: userEmail,
            id: '550e8400-e29b-41d4-a716-446655440001'
          },
          linkedAt
        },
        unlinked: [
          {
            id: unlinkedOrg.id,
            name: unlinkedOrg.companyDetails.name,
            orgId: unlinkedOrg.orgId
          }
        ]
      }
    })
  })

  it('should return null for linked when user has no linked organisation', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true
    })

    const server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })

    const userEmail = 'someone@test-company.com'

    // Only unlinked organisations (no linkedDefraOrganisation)
    const unlinkedOrg1 = buildOrganisation({
      users: [
        {
          fullName: 'Test User',
          email: userEmail,
          isInitialUser: true,
          roles: ['standard_user']
        }
      ]
    })

    const unlinkedOrg2 = buildOrganisation({
      users: [
        {
          fullName: 'Test User',
          email: userEmail,
          isInitialUser: true,
          roles: ['standard_user']
        }
      ]
    })

    await organisationsRepository.insert(unlinkedOrg1)
    await organisationsRepository.insert(unlinkedOrg2)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.current).toEqual({
      id: VALID_TOKEN_CURRENT_ORG_ID,
      name: 'Test Company Ltd',
      relationshipId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID
    })
    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toHaveLength(2)
  })

  it('should return empty unlinked array when user only has linked organisation', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true
    })

    const server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })

    const userEmail = 'someone@test-company.com'
    const linkedAt = new Date().toISOString()

    // Only linked organisation
    const linkedOrg = buildOrganisation({
      users: [
        {
          fullName: 'Test User',
          email: userEmail,
          isInitialUser: true,
          roles: ['standard_user']
        }
      ],
      linkedDefraOrganisation: {
        orgId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID,
        orgName: 'Test Company Ltd',
        linkedBy: {
          email: userEmail,
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt
      }
    })

    await organisationsRepository.insert(linkedOrg)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.linked).not.toBeNull()
    expect(result.organisations.unlinked).toEqual([])
  })

  it('should return empty arrays when user has no organisations', async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    const featureFlags = createInMemoryFeatureFlags({
      organisations: true
    })

    const server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })

    // No organisations inserted

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.current).toEqual({
      id: VALID_TOKEN_CURRENT_ORG_ID,
      name: 'Test Company Ltd',
      relationshipId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID
    })
    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toEqual([])
  })
})
