import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeEach } from 'vitest'

const { validToken } = entraIdMockAuthTokens

const buildFixture = () =>
  /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (
      buildOrganisation({
        registrations: [
          buildRegistration({
            reprocessingType: 'input',
            validTo: '2027-01-01',
            statusHistory: [{ status: 'created', updatedAt: '2026-01-01' }]
          })
        ],
        accreditations: []
      })
    )
  )

describe('PUT /v1/dev/organisations/{id}', () => {
  setupAuthContext()

  it('returns 404 when the devEndpoints feature flag is disabled', async () => {
    const featureFlags = createInMemoryFeatureFlags({ devEndpoints: false })
    const server = await createTestServer({ featureFlags })

    const response = await server.inject({
      method: 'PUT',
      url: '/v1/dev/organisations/123',
      payload: { version: 1, updateFragment: {} }
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('feature flag enabled', () => {
    let server
    let fixture

    beforeEach(async () => {
      fixture = buildFixture()
      server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({ devEndpoints: true }),
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository()
        }
      })
    })

    it('changes a registration status without authentication — the seeding path the public route refuses (PAE-1645)', async () => {
      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${fixture.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      expect(getResponse.statusCode).toBe(StatusCodes.OK)
      const org = JSON.parse(getResponse.payload)
      const registration = org.registrations[0]

      const updateFragment = {
        ...org,
        registrations: [
          {
            ...registration,
            status: 'approved',
            registrationNumber: 'REG-DEV-SEED-1',
            validFrom: '2026-01-01',
            statusHistory: [
              ...registration.statusHistory,
              { status: 'approved', updatedAt: '2026-01-02' }
            ]
          }
        ]
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: { version: Number(org.version), updateFragment }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).registrations[0].status).toBe(
        'approved'
      )
    })

    it('seeds a registration statusHistory with custom dates when the status is unchanged (PAE-1809)', async () => {
      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${fixture.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const org = JSON.parse(getResponse.payload)
      const registration = org.registrations[0]

      const updateFragment = {
        ...org,
        registrations: [
          {
            ...registration,
            statusHistory: [
              { status: 'created', updatedAt: '2025-06-30T00:00:00.000Z' }
            ]
          }
        ]
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: { version: Number(org.version), updateFragment }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const updatedRegistration = JSON.parse(response.payload).registrations[0]
      expect(updatedRegistration.status).toBe('created')
      expect(updatedRegistration.statusHistory).toEqual([
        { status: 'created', updatedAt: '2025-06-30T00:00:00.000Z' }
      ])
    })

    it('seeds an extra statusHistory entry — the structure change the public route refuses (PAE-1809)', async () => {
      const getResponse = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${fixture.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const org = JSON.parse(getResponse.payload)
      const registration = org.registrations[0]

      const updateFragment = {
        ...org,
        registrations: [
          {
            ...registration,
            statusHistory: [
              { status: 'created', updatedAt: '2025-06-30T00:00:00.000Z' },
              { status: 'approved', updatedAt: '2025-07-01T00:00:00.000Z' }
            ]
          }
        ]
      }

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/dev/organisations/${org.id}`,
        payload: { version: Number(org.version), updateFragment }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).registrations[0].status).toBe(
        'approved'
      )
    })
  })
})
