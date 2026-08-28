import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asServiceMaintainer,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { REGISTRATION_STATUS } from '#domain/organisations/model.js'
import { registrationGetPath } from '../get.js'
import { registrationsListPath } from './get.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

/**
 * The repository derives `status` on read, so the builders return an
 * organisation without one.
 * @typedef {Omit<Organisation, 'status'>} StoredOrganisation
 */

const aRegistration = (overrides = {}) => buildRegistration(overrides)

/**
 * @param {ReturnType<typeof aRegistration>[]} registrations
 * @returns {StoredOrganisation}
 */
const anOrganisation = (registrations) =>
  buildOrganisation({ registrations, accreditations: [] })

/**
 * @param {StoredOrganisation} organisation
 * @param {string} [organisationId]
 */
const serve = async (organisation, organisationId = organisation.id) => {
  const server = await createTestServer({
    repositories: {
      organisationsRepository: createInMemoryOrganisationsRepository([
        partialMock(organisation)
      ])
    }
  })

  return {
    server,
    request: {
      method: 'GET',
      url: registrationsListPath.replace('{organisationId}', organisationId)
    }
  }
}

/**
 * @param {StoredOrganisation} organisation
 * @param {string} [organisationId]
 */
const read = async (organisation, organisationId) => {
  const { server, request } = await serve(organisation, organisationId)

  return server.inject({ ...request, ...asServiceMaintainer() })
}

/**
 * @param {StoredOrganisation} organisation
 */
const readRegistrations = async (organisation) => {
  const response = await read(organisation)

  expect(response.statusCode).toBe(StatusCodes.OK)
  return JSON.parse(response.payload).registrations
}

describe(`GET ${registrationsListPath}`, () => {
  setupAuthContext()

  it('returns every registration the organisation holds', async () => {
    const organisation = anOrganisation([
      aRegistration({ registrationNumber: 'R26ER5001180041PL' }),
      aRegistration({
        wasteProcessingType: 'exporter',
        registrationNumber: 'R26ER5001180042PL'
      })
    ])

    const registrations = await readRegistrations(organisation)

    expect(registrations.map((entry) => entry.registrationNumber)).toEqual([
      'R26ER5001180041PL',
      'R26ER5001180042PL'
    ])
  })

  it('returns an empty list for an organisation that holds none, which is not an error', async () => {
    const response = await read(anOrganisation([]))

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual({ registrations: [] })
  })

  it('returns 404 for an organisation the store does not hold', async () => {
    const response = await read(
      anOrganisation([aRegistration()]),
      '68f6a147c117aec8a1ab74ff'
    )

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('hands out the same resource the member address serves', async () => {
    const registration = aRegistration({
      registrationNumber: 'R26ER5001180041PL'
    })
    const organisation = anOrganisation([registration])
    const { server } = await serve(organisation)

    const [item] = JSON.parse(
      (
        await server.inject({
          method: 'GET',
          url: registrationsListPath.replace(
            '{organisationId}',
            organisation.id
          ),
          ...asServiceMaintainer()
        })
      ).payload
    ).registrations
    const member = JSON.parse(
      (
        await server.inject({
          method: 'GET',
          url: registrationGetPath
            .replace('{organisationId}', organisation.id)
            .replace('{registrationId}', registration.id),
          ...asServiceMaintainer()
        })
      ).payload
    )

    expect(item).toEqual(member)
  })

  describe('ordering', () => {
    it('orders by registration number ascending', async () => {
      const organisation = anOrganisation([
        aRegistration({ registrationNumber: 'R26ER5001180043PL' }),
        aRegistration({ registrationNumber: 'R26ER5001180041PL' }),
        aRegistration({ registrationNumber: 'R26ER5001180042PL' })
      ])

      const registrations = await readRegistrations(organisation)

      expect(registrations.map((entry) => entry.registrationNumber)).toEqual([
        'R26ER5001180041PL',
        'R26ER5001180042PL',
        'R26ER5001180043PL'
      ])
    })

    it('puts a registration that holds no number after every one that does', async () => {
      const organisation = anOrganisation([
        aRegistration({ registrationNumber: undefined }),
        aRegistration({ registrationNumber: 'R26ER5001180042PL' }),
        aRegistration({ registrationNumber: undefined }),
        aRegistration({ registrationNumber: 'R26ER5001180041PL' })
      ])

      const registrations = await readRegistrations(organisation)

      expect(registrations.map((entry) => entry.registrationNumber)).toEqual([
        'R26ER5001180041PL',
        'R26ER5001180042PL',
        null,
        null
      ])
    })

    it('settles a tie on the id, so the order is total', async () => {
      const unnumbered = [aRegistration(), aRegistration(), aRegistration()]
      const organisation = anOrganisation(unnumbered)

      const registrations = await readRegistrations(organisation)

      expect(registrations.map((entry) => entry.id)).toEqual(
        unnumbered.map((entry) => entry.id).sort()
      )
    })
  })

  it('returns a registration whatever its status, a rejected one being what a regulator opens the page to see', async () => {
    const organisation = anOrganisation([
      aRegistration({
        statusHistory: [
          { status: REGISTRATION_STATUS.CREATED, updatedAt: '2026-01-01' },
          { status: REGISTRATION_STATUS.REJECTED, updatedAt: '2026-02-01' }
        ]
      })
    ])

    const registrations = await readRegistrations(organisation)

    expect(registrations.map((entry) => entry.status)).toEqual(['rejected'])
  })

  describe('access control', () => {
    const organisation = anOrganisation([aRegistration()])

    /** @type {import('#test/create-test-server.js').TestServer} */
    let server

    const serveOrganisation = async () => {
      const served = await serve(organisation)
      server = served.server
      return served.request
    }

    it('shows an operator the registrations of their own organisation', async () => {
      const request = await serveOrganisation()

      const response = await server.inject({ ...request, ...asOperator() })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('refuses a caller who holds no organisation read', async () => {
      const request = await serveOrganisation()

      const response = await server.inject({
        ...request,
        ...asUnscopedAdminUser()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    testRegulatorCanRead({
      server: () => server,
      makeRequest: serveOrganisation
    })
  })
})
