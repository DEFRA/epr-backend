import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'

const { validToken } = entraIdMockAuthTokens

const buildOrgWithName = (name) => {
  const base = buildOrganisation()
  return {
    ...base,
    companyDetails: { ...base.companyDetails, name }
  }
}

const authHeaders = { Authorization: `Bearer ${validToken}` }

describe('GET /v1/organisations', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags()

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('Mode A — legacy (no recognised query params)', () => {
    it('returns 200 and a top-level array of all organisations', async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()

      await organisationsRepository.insert(org1)
      await organisationsRepository.insert(org2)

      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations',
        headers: authHeaders
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(org1.id)
      expect(result[1].id).toBe(org2.id)
    })

    it('returns an empty array when no organisations exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations',
        headers: authHeaders
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual([])
    })
  })

  describe('Mode B — paginated (any of search, page, pageSize present)', () => {
    describe('mode trigger', () => {
      it('returns envelope shape when only page is provided', async () => {
        await organisationsRepository.insert(buildOrganisation())

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?page=1',
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const result = JSON.parse(response.payload)
        expect(Array.isArray(result)).toBe(false)
        expect(result).toHaveProperty('items')
        expect(result).toHaveProperty('totalItems')
      })

      it('returns envelope shape when only pageSize is provided', async () => {
        await organisationsRepository.insert(buildOrganisation())

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?pageSize=10',
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const result = JSON.parse(response.payload)
        expect(Array.isArray(result)).toBe(false)
        expect(result).toHaveProperty('items')
      })

      it('returns envelope shape when only search is provided', async () => {
        await organisationsRepository.insert(buildOrgWithName('Acme Ltd'))
        await organisationsRepository.insert(buildOrgWithName('Globex Inc'))

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?search=acme',
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const result = JSON.parse(response.payload)
        expect(Array.isArray(result)).toBe(false)
        expect(result.totalItems).toBe(1)
        expect(result.items[0].companyDetails.name).toBe('Acme Ltd')
      })
    })

    describe('response shape', () => {
      it('returns envelope with items, page, pageSize, totalItems, totalPages', async () => {
        await organisationsRepository.insert(buildOrgWithName('Alpha'))
        await organisationsRepository.insert(buildOrgWithName('Bravo'))
        await organisationsRepository.insert(buildOrgWithName('Charlie'))

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?page=1&pageSize=10',
          headers: authHeaders
        })

        const result = JSON.parse(response.payload)
        expect(result).toMatchObject({
          page: 1,
          pageSize: 10,
          totalItems: 3,
          totalPages: 1
        })
        expect(result.items).toHaveLength(3)
      })
    })

    describe('defaults', () => {
      it('applies default pageSize=50 when only search is provided', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?search=anything',
          headers: authHeaders
        })

        expect(JSON.parse(response.payload).pageSize).toBe(50)
      })

      it('applies default page=1 when only pageSize is provided', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?pageSize=10',
          headers: authHeaders
        })

        expect(JSON.parse(response.payload).page).toBe(1)
      })
    })

    describe('search and pagination semantics', () => {
      it('filters by case-insensitive substring on company name', async () => {
        await organisationsRepository.insert(buildOrgWithName('Acme Ltd'))
        await organisationsRepository.insert(buildOrgWithName('ACME Corp'))
        await organisationsRepository.insert(buildOrgWithName('Globex Inc'))

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?search=acme&page=1&pageSize=50',
          headers: authHeaders
        })

        const result = JSON.parse(response.payload)
        expect(result.totalItems).toBe(2)
      })

      it('sorts items alphabetically by company name', async () => {
        await organisationsRepository.insert(buildOrgWithName('Charlie Ltd'))
        await organisationsRepository.insert(buildOrgWithName('Alpha Co'))
        await organisationsRepository.insert(buildOrgWithName('Bravo Inc'))

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?page=1&pageSize=50',
          headers: authHeaders
        })

        const result = JSON.parse(response.payload)
        expect(result.items.map((o) => o.companyDetails.name)).toEqual([
          'Alpha Co',
          'Bravo Inc',
          'Charlie Ltd'
        ])
      })

      it('returns empty items but valid totals when page is beyond the end', async () => {
        await organisationsRepository.insert(buildOrganisation())

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?page=99&pageSize=10',
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const result = JSON.parse(response.payload)
        expect(result.items).toEqual([])
        expect(result.totalItems).toBe(1)
        expect(result.totalPages).toBe(1)
      })

      it('treats whitespace-only search as no filter', async () => {
        await organisationsRepository.insert(buildOrgWithName('Acme Ltd'))
        await organisationsRepository.insert(buildOrgWithName('Globex Inc'))

        const response = await server.inject({
          method: 'GET',
          url: '/v1/organisations?search=%20%20',
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(JSON.parse(response.payload).totalItems).toBe(2)
      })
    })
  })

  describe('validation', () => {
    it.each([
      ['page=0', '/v1/organisations?page=0'],
      ['page negative', '/v1/organisations?page=-1'],
      ['page non-integer', '/v1/organisations?page=abc'],
      ['pageSize=0', '/v1/organisations?pageSize=0'],
      ['pageSize over max', '/v1/organisations?pageSize=201'],
      ['pageSize negative', '/v1/organisations?pageSize=-5'],
      ['unknown query param', '/v1/organisations?unknownParam=x'],
      [
        'search exceeds max length',
        `/v1/organisations?search=${'a'.repeat(201)}`
      ]
    ])('returns 422 for %s', async (_desc, url) => {
      const response = await server.inject({
        method: 'GET',
        url,
        headers: authHeaders
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org1 = buildOrganisation()
      await organisationsRepository.insert(org1)
      return {
        method: 'GET',
        url: `/v1/organisations/${org1.id}`
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const org1 = buildOrganisation()
      await organisationsRepository.insert(org1)
      return {
        method: 'GET',
        url: `/v1/organisations/${org1.id}`
      }
    }
  })
})
