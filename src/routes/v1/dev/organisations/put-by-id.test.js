import {
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeEach } from 'vitest'

const { buildOrganisation } = createOrganisationBuilders()

const { validToken } = entraIdMockAuthTokens

const buildFixture = () =>
  /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (
      buildOrganisation({
        registrations: [
          buildRegistration({
            reprocessingType: 'input',
            statusHistory: [{ status: 'created', updatedAt: '2026-01-01' }]
          })
        ],
        accreditations: []
      })
    )
  )

/**
 * @param {import('#test/create-test-server.js').TestServer} server
 * @param {string} id
 */
const getOrganisation = async (server, id) => {
  const response = await server.inject({
    method: 'GET',
    url: `/v1/organisations/${id}`,
    headers: { Authorization: `Bearer ${validToken}` }
  })
  expect(response.statusCode).toBe(StatusCodes.OK)
  return JSON.parse(response.payload)
}

/**
 * @param {import('#test/create-test-server.js').TestServer} server
 * @param {{ id: string, version: number }} org
 * @param {object} updateFragment
 */
const putThroughDevRoute = async (server, org, updateFragment) => {
  const response = await server.inject({
    method: 'PUT',
    url: `/v1/dev/organisations/${org.id}`,
    payload: { version: Number(org.version), updateFragment }
  })
  return { statusCode: response.statusCode, body: JSON.parse(response.payload) }
}

describe('PUT /v1/dev/organisations/{id}', () => {
  setupAuthContext()

  it('returns 404 when the devEndpoints feature flag is disabled', async () => {
    const server = await createTestServer({
      config: { featureFlags: { devEndpoints: false } }
    })

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
        config: { featureFlags: { devEndpoints: true } },
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            fixture
          ]),
          systemLogsRepository: createSystemLogsRepository()
        }
      })
    })

    it('changes a registration status without authentication — the seeding path the public route refuses (PAE-1645)', async () => {
      const org = await getOrganisation(server, fixture.id)
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

      const { statusCode, body } = await putThroughDevRoute(
        server,
        org,
        updateFragment
      )

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.registrations[0].status).toBe('approved')
    })

    it('seeds a registration statusHistory with custom dates when the status is unchanged (PAE-1809)', async () => {
      const org = await getOrganisation(server, fixture.id)
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

      const { statusCode, body } = await putThroughDevRoute(
        server,
        org,
        updateFragment
      )

      expect(statusCode).toBe(StatusCodes.OK)
      const updatedRegistration = body.registrations[0]
      expect(updatedRegistration.status).toBe('created')
      expect(updatedRegistration.statusHistory).toEqual([
        { status: 'created', updatedAt: '2025-06-30T00:00:00.000Z' }
      ])
    })

    it('seeds an extra statusHistory entry — the structure change the public route refuses (PAE-1809)', async () => {
      const org = await getOrganisation(server, fixture.id)
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

      const { statusCode, body } = await putThroughDevRoute(
        server,
        org,
        updateFragment
      )

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.registrations[0].status).toBe('approved')
    })
  })

  it('suspends an approved accreditation without authentication', async () => {
    const accreditationId = new ObjectId().toString()
    const fixture = buildOrganisation({
      registrations: [reprocessor({ accreditationId })],
      accreditations: [
        accreditation({ id: accreditationId, reprocessingType: 'input' })
      ]
    })
    const server = await createTestServer({
      config: { featureFlags: { devEndpoints: true } },
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(fixture)
        ]),
        systemLogsRepository: createSystemLogsRepository()
      }
    })
    const org = await getOrganisation(server, fixture.id)
    const approved = org.accreditations[0]
    expect(approved.status).toBe('approved')

    const updateFragment = {
      ...org,
      accreditations: [
        {
          ...approved,
          status: 'suspended',
          statusHistory: [
            ...approved.statusHistory,
            { status: 'suspended', updatedAt: '2026-07-02' }
          ]
        }
      ]
    }

    const { statusCode, body } = await putThroughDevRoute(
      server,
      org,
      updateFragment
    )

    expect(statusCode).toBe(StatusCodes.OK)
    expect(body.accreditations[0].status).toBe('suspended')
  })
})
