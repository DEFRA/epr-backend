import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

describe('GET /v1/organisations/{organisationId}/accreditations/{accreditationId}/prns', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId = '507f1f77bcf86cd799439011'
  const differentOrgId = '7777777777777777777777ff'

  const stubPrns = [
    {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      prnNumber: 'PRN-2026-00001',
      accreditationId,
      organisationId,
      issuedToOrganisation: {
        id: 'producer-001',
        name: 'ComplyPak Ltd'
      },
      tonnageValue: 9,
      createdAt: new Date('2026-01-21T10:30:00Z'),
      status: { currentStatus: 'awaiting_authorisation' }
    },
    {
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      prnNumber: 'PRN-2026-00002',
      accreditationId,
      organisationId,
      issuedToOrganisation: {
        id: 'producer-002',
        name: 'Nestle (SEPA)',
        tradingName: 'Nestle UK'
      },
      tonnageValue: 4,
      createdAt: new Date('2026-01-19T14:00:00Z'),
      status: { currentStatus: 'awaiting_authorisation' }
    }
  ]

  describe('with valid authentication and PRN data', () => {
    let server

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(stubPrns)
        },
        featureFlags
      })
    })

    it('returns PRNs for the accreditation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const result = JSON.parse(response.payload)

      expect(result.items).toHaveLength(2)
      expect(result.hasMore).toBe(false)
    })

    it('returns PRN data in expected format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const result = JSON.parse(response.payload)
      const firstPrn = result.items[0]

      expect(firstPrn).toMatchObject({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        prnNumber: 'PRN-2026-00001',
        issuedToOrganisation: {
          name: 'ComplyPak Ltd'
        },
        tonnageValue: 9,
        status: 'awaiting_authorisation'
      })

      expect(firstPrn.createdAt).toBe('2026-01-21T10:30:00.000Z')
    })

    it('includes tradingName when present', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const result = JSON.parse(response.payload)
      const secondPrn = result.items[1]

      expect(secondPrn.issuedToOrganisation).toEqual({
        name: 'Nestle (SEPA)',
        tradingName: 'Nestle UK'
      })
    })
  })

  describe('empty state', () => {
    let server

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([])
        },
        featureFlags
      })
    })

    it('returns empty items array when no PRNs exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const result = JSON.parse(response.payload)

      expect(result.items).toEqual([])
      expect(result.hasMore).toBe(false)
    })
  })

  describe('validation errors', () => {
    let server

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(stubPrns)
        },
        featureFlags
      })
    })

    it('rejects invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/invalid/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid accreditationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/invalid/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('authentication', () => {
    let server

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(stubPrns)
        },
        featureFlags
      })
    })

    it('requires authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('authorization', () => {
    it('returns 403 when accreditation belongs to a different organisation', async () => {
      // Scenario: user queries their own org but with an accreditation
      // that belongs to a different org. The PRNs for that accreditation
      // will have a different organisationId, triggering the ownership check.
      const prnFromDifferentOrg = [
        {
          _id: 'cccccccccccccccccccccccc',
          prnNumber: 'PRN-2026-00003',
          accreditationId,
          organisationId: differentOrgId,
          issuedToOrganisation: { name: 'Other Org' },
          tonnageValue: 5,
          createdAt: new Date('2026-01-20T10:00:00Z'),
          status: { currentStatus: 'awaiting_authorisation' }
        }
      ]

      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(prnFromDifferentOrg)
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)

      const result = JSON.parse(response.payload)

      expect(result.error).toBe('Forbidden')
    })

    it('returns empty items when accreditation has no PRNs', async () => {
      // Scenario: user queries their own org with an accreditation ID
      // that has no PRNs. This returns 200 with empty items because
      // the ownership check only triggers when PRNs exist.
      const unrelatedAccreditationId = 'eeeeeeeeeeeeeeeeeeeeeeee'

      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(stubPrns)
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${unrelatedAccreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const result = JSON.parse(response.payload)

      expect(result.items).toEqual([])
    })
  })

  describe('feature flag', () => {
    it('returns 404 when feature flag is disabled', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: false
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository(stubPrns)
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
