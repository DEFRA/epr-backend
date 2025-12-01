import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import { defraIdMockAuthTokens } from '#vite/helpers/create-defra-id-test-tokens.js'
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

  it('should return linked and unlinked organisations for the user', async () => {
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

    // Linked organisation (has linkedDefraOrganisation and user in users array)
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
        orgId: '550e8400-e29b-41d4-a716-446655440000',
        orgName: 'Defra Organisation',
        linkedBy: {
          email: userEmail,
          id: '550e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt: new Date().toISOString()
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

    // Organisation without the user (should not appear in either array)
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

    console.log('result :>> ', result)
    console.dir(result, { depth: null })

    // FIXME work out what data we need to support the linking journey in the frontend
    //  we def don't need the whole org data for each of these :laughing:
    expect(result).toEqual({
      organisations: {
        linked: [
          expect.objectContaining({
            id: linkedOrg.id,
            orgId: linkedOrg.orgId,
            linkedDefraOrganisation: linkedOrg.linkedDefraOrganisation,
            users: linkedOrg.users
          })
        ],
        unlinked: [
          expect.objectContaining({
            id: unlinkedOrg.id,
            orgId: unlinkedOrg.orgId,
            users: unlinkedOrg.users
          })
        ]
      }
    })
  })
})
