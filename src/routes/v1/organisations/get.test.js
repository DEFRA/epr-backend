import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildOrgWithCriteria,
  buildOrgWithName
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import {
  testOnlyServiceMaintainerCanAccess,
  testRegulatorCanRead
} from '#vite/helpers/test-invalid-roles-scenarios.js'

const { validToken } = entraIdMockAuthTokens

const authHeaders = { Authorization: `Bearer ${validToken}` }

describe('GET /v1/organisations', () => {
  setupAuthContext()
  /**
   * @type {import('#test/create-test-server.js').TestServer}
   */
  let server

  /**
   * @type {import('#repositories/organisations/port.js').OrganisationsRepository}
   */
  let organisationsRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
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

        /**
         * @type {{ items: Array<import('#domain/organisations/model.js').Organisation> }} result
         */
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

  describe('Mode B — criteria search', () => {
    const HOLDER_ORG_ID = 700001
    const OTHER_ORG_ID = 700002

    /** @type {Omit<import('#domain/organisations/model.js').Organisation, 'status'>} */
    let holder

    beforeEach(async () => {
      holder = buildOrgWithCriteria({
        name: 'Holder Ltd',
        orgId: HOLDER_ORG_ID,
        registrationNumber: 'REG001',
        accreditationNumber: 'ACC001'
      })
      await organisationsRepository.insert(holder)
      await organisationsRepository.insert(
        buildOrgWithCriteria({
          name: 'Other Ltd',
          orgId: OTHER_ORG_ID,
          registrationNumber: 'REG002',
          accreditationNumber: 'ACC444'
        })
      )
    })

    /**
     * @param {string} queryString
     * @returns {Promise<{ statusCode: number, body: any }>}
     */
    const get = async (queryString) => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations?${queryString}`,
        headers: authHeaders
      })
      return {
        statusCode: response.statusCode,
        body: JSON.parse(response.payload)
      }
    }

    it.each([
      ['orgId as the business orgId', () => `orgId=${HOLDER_ORG_ID}`],
      ['orgId as the document id', () => `orgId=${holder.id}`],
      ['registrationId', () => `registrationId=${holder.registrations[0].id}`],
      ['registrationNumber', () => 'registrationNumber=REG001'],
      [
        'accreditationId',
        () => `accreditationId=${holder.accreditations[0].id}`
      ],
      ['accreditationNumber', () => 'accreditationNumber=ACC001']
    ])(
      'returns the paged envelope holding only the matching organisation for %s',
      async (_description, buildQuery) => {
        const { statusCode, body } = await get(buildQuery())

        expect(statusCode).toBe(StatusCodes.OK)
        expect(Array.isArray(body)).toBe(false)
        expect(body.totalItems).toBe(1)
        expect(body.items.map((o) => o.companyDetails.name)).toEqual([
          'Holder Ltd'
        ])
      }
    )

    it('applies the page defaults to a criteria-only request', async () => {
      const { body } = await get('registrationNumber=REG001')

      expect(body.page).toBe(1)
      expect(body.pageSize).toBe(50)
    })

    it('ANDs multiple criteria', async () => {
      const { body } = await get(
        'registrationNumber=REG001&accreditationNumber=ACC001'
      )

      expect(body.totalItems).toBe(1)
      expect(body.items[0].companyDetails.name).toBe('Holder Ltd')
    })

    it('returns no items when criteria are satisfied by different organisations', async () => {
      const { statusCode, body } = await get(
        'registrationNumber=REG001&accreditationNumber=ACC444'
      )

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.items).toEqual([])
      expect(body.totalItems).toBe(0)
    })

    it('ANDs a criterion with the name search', async () => {
      const { body } = await get('search=other&registrationNumber=REG001')

      expect(body.items).toEqual([])
    })

    it('returns an empty result rather than an error for an unparseable orgId', async () => {
      const { statusCode, body } = await get('orgId=not-an-id')

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.items).toEqual([])
      expect(body.totalItems).toBe(0)
    })

    it('treats empty criteria as absent', async () => {
      const { body } = await get(
        'orgId=&registrationId=&registrationNumber=&accreditationId=&accreditationNumber='
      )

      expect(body.totalItems).toBe(2)
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
      ],
      [
        'orgId exceeds max length',
        `/v1/organisations?orgId=${'1'.repeat(201)}`
      ],
      [
        'registrationId exceeds max length',
        `/v1/organisations?registrationId=${'a'.repeat(201)}`
      ],
      [
        'registrationNumber exceeds max length',
        `/v1/organisations?registrationNumber=${'a'.repeat(201)}`
      ],
      [
        'accreditationId exceeds max length',
        `/v1/organisations?accreditationId=${'a'.repeat(201)}`
      ],
      [
        'accreditationNumber exceeds max length',
        `/v1/organisations?accreditationNumber=${'a'.repeat(201)}`
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

  const makeListRequest = async () => {
    await organisationsRepository.insert(buildOrganisation())
    return {
      method: 'GET',
      url: '/v1/organisations?page=1&pageSize=10'
    }
  }

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: makeListRequest
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: makeListRequest
  })

  describe('the organisation.search scope', () => {
    testRegulatorCanRead({
      server: () => server,
      makeRequest: makeListRequest
    })

    it.each([
      ['service_maintainer_write', entraIdMockAuthTokens.validToken],
      ['service_maintainer', entraIdMockAuthTokens.readOnlyMaintainerToken],
      ['support', entraIdMockAuthTokens.supportToken]
    ])('returns 200 for an admin user on the %s tier', async (_tier, token) => {
      const requestConfig = await makeListRequest()

      const response = await server.inject({
        ...requestConfig,
        headers: { Authorization: `Bearer ${token}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })
})
