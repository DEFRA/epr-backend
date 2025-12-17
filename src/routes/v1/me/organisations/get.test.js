import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME,
  COMPANY_2_ID,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { randomUUID } from 'crypto'
import { StatusCodes } from 'http-status-codes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('GET /v1/me/organisations', () => {
  setupAuthContext()

  beforeAll(() => {
    config.set('featureFlags.defraIdAuth', true)
  })

  let email
  let token
  beforeEach(() => {
    email = `hello.${randomUUID()}@example.com`
    token = generateValidTokenWith({
      email
    })
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

    const linkedAt = new Date().toISOString()

    // Linked organisation (has linkedDefraOrganisation matching current relationship from token)
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
        linkedBy: {
          email,
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt
      }
    })

    // Unlinked organisation (no linkedDefraOrganisation but has user in users array)
    const unlinkedOrg = await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    // Organisation without the user (should not appear in response)
    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Other User',
          email: 'other@example.com',
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result).toEqual({
      organisations: {
        current: {
          id: COMPANY_1_ID,
          name: COMPANY_1_NAME
        },
        linked: {
          id: COMPANY_1_ID,
          name: COMPANY_1_NAME,
          linkedBy: {
            email,
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

    // Only unlinked organisations (no linkedDefraOrganisation)
    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.current).toEqual({
      id: COMPANY_1_ID,
      name: COMPANY_1_NAME
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

    const linkedAt = new Date().toISOString()

    // Only linked organisation
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
        orgName: 'Test Company Ltd',
        linkedBy: {
          email,
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
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
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.current).toEqual({
      id: COMPANY_1_ID,
      name: COMPANY_1_NAME
    })
    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toEqual([])
  })

  it('should exclude organisations where user is not an initial user', async () => {
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

    // Organisation where user is initial user (should be included)
    const initialUserOrg = await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    // Organisation where user is NOT initial user (should be excluded)
    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['standard_user']
        }
      ]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toHaveLength(1)
    expect(result.organisations.unlinked[0].id).toBe(initialUserOrg.id)
  })

  it('should exclude organisations already linked to other Defra organisations', async () => {
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

    const linkedAt = new Date().toISOString()

    // Organisation already linked to a different Defra organisation
    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ],
      linkedDefraOrganisation: {
        orgId: COMPANY_2_ID,
        orgName: 'Different Defra Organisation',
        linkedBy: {
          email: 'someone.else@example.com',
          id: '550e8400-e29b-41d4-a716-446655440002'
        },
        linkedAt
      }
    })

    // Unlinked organisation (control case)
    const unlinkedOrg = await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toHaveLength(1)
    expect(result.organisations.unlinked[0].id).toBe(unlinkedOrg.id)
  })

  it('should exclude organisations that are not approved', async () => {
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

    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Test User',
          email,
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    await organisationsRepository.insert(
      buildOrganisation({
        users: [
          {
            fullName: 'Test User',
            email,
            roles: ['initial_user', 'standard_user']
          }
        ]
      })
    )

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result.organisations.linked).toBeNull()
    expect(result.organisations.unlinked).toHaveLength(1)
  })

  it('should add the user if they are not already present in the org', async () => {
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

    const linkedAt = new Date().toISOString()

    // Linked organisation (linked by another user)
    const linkedOrg = await buildApprovedOrg(organisationsRepository, {
      linkedDefraOrganisation: {
        orgId: COMPANY_1_ID,
        orgName: COMPANY_1_NAME,
        linkedBy: {
          email: 'initial.user@example.com',
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt
      },
      users: [
        {
          fullName: 'Test User',
          email: 'initial.user@example.com',
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    // Organisation without the user (should not appear in response)
    await buildApprovedOrg(organisationsRepository, {
      users: [
        {
          fullName: 'Other User',
          email: 'other@example.com',
          roles: ['initial_user', 'standard_user']
        }
      ]
    })

    const tokenOverrides = {
      contactId: randomUUID(),
      email: 'invited.user@example.com',
      firstName: 'Invited',
      lastName: 'User'
    }

    const token = generateValidTokenWith(tokenOverrides)

    const response = await server.inject({
      method: 'GET',
      url: '/v1/me/organisations',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const linkedAndUpdated = await waitForVersion(
      organisationsRepository,
      linkedOrg.id,
      3
    )

    // FIXME typing issue due to hardcoded return type
    // expect our invited user has been appended as a standard_user
    expect(linkedAndUpdated.users).toStrictEqual([
      ...linkedOrg.users,
      {
        contactId: tokenOverrides.contactId,
        email: tokenOverrides.email,
        fullName: 'Invited User',
        roles: ['standard_user']
      }
    ])

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    // pre-linked organisation
    expect(result).toEqual({
      organisations: expect.objectContaining({
        linked: {
          id: COMPANY_1_ID,
          name: COMPANY_1_NAME,
          linkedBy: {
            email: 'initial.user@example.com',
            id: '550e8400-e29b-41d4-a716-446655440001'
          },
          linkedAt
        }
      })
    })
  })
})
