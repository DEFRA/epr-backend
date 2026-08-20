import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'
import {
  ACCREDITATION_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { registrationDetailsGetPath } from './get.js'

/** @import { AccreditationStatus, Organisation } from '#domain/organisations/model.js' */
/** @import { Accreditation, StatusHistoryEntry } from '#domain/organisations/accreditation.js' */

/**
 * The repository derives `status` on read, so the builders return an
 * organisation without one.
 * @typedef {Omit<Organisation, 'status'>} StoredOrganisation
 */

/**
 * @param {string} organisationId
 * @param {string} registrationId
 */
const makePath = (organisationId, registrationId) =>
  registrationDetailsGetPath
    .replace('{organisationId}', organisationId)
    .replace('{registrationId}', registrationId)

/**
 * A stored accreditation carries no `status`: the insert schema forbids the
 * field and the repository derives it from the history on read. The history
 * also has to be in place before the repository is created, because insert()
 * replaces it with a single 'created' entry.
 *
 * @param {AccreditationStatus} status
 * @returns {StatusHistoryEntry[]}
 */
const statusHistoryEndingIn = (status) => [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2026-01-01' },
  ...(status === ACCREDITATION_STATUS.CREATED
    ? []
    : [{ status, updatedAt: '2026-02-01' }])
]

/**
 * @param {AccreditationStatus} [status]
 * @param {Partial<Accreditation>} [overrides]
 * @returns {Accreditation}
 */
const anAccreditation = (status = ACCREDITATION_STATUS.APPROVED, overrides) =>
  buildAccreditation({
    accreditationNumber: 'A26ER5001180114PL',
    reprocessingType: REPROCESSING_TYPE.INPUT,
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: statusHistoryEndingIn(status),
    ...overrides
  })

const anUnnumberedAccreditation = () =>
  buildAccreditation({
    reprocessingType: REPROCESSING_TYPE.INPUT,
    statusHistory: statusHistoryEndingIn(ACCREDITATION_STATUS.CREATED)
  })

const aRegistration = (overrides = {}) =>
  buildRegistration({ reprocessingType: REPROCESSING_TYPE.INPUT, ...overrides })

/**
 * @param {ReturnType<typeof aRegistration>} registration
 * @param {Accreditation[]} [accreditations]
 * @returns {StoredOrganisation}
 */
const anOrganisation = (registration, accreditations = []) =>
  buildOrganisation({ registrations: [registration], accreditations })

/**
 * @param {StoredOrganisation} organisation
 * @param {string} registrationId
 */
const readRegistration = async (organisation, registrationId) => {
  const server = await createTestServer({
    repositories: {
      organisationsRepository: createInMemoryOrganisationsRepository([
        partialMock(organisation)
      ])
    }
  })

  return server.inject({
    method: 'GET',
    url: makePath(organisation.id, registrationId),
    ...asServiceMaintainer()
  })
}

/**
 * @param {StoredOrganisation} organisation
 * @param {string} registrationId
 */
const readAccreditations = async (organisation, registrationId) => {
  const response = await readRegistration(organisation, registrationId)

  expect(response.statusCode).toBe(StatusCodes.OK)
  return JSON.parse(response.payload).accreditations
}

describe(`GET ${registrationDetailsGetPath}`, () => {
  setupAuthContext()

  it('returns the registration and the organisation that holds it', async () => {
    const registration = aRegistration({
      registrationNumber: 'R26ER5001180041PL'
    })
    const organisation = anOrganisation(registration)

    const response = await readRegistration(organisation, registration.id)

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.organisationId).toBe(organisation.id)
    expect(result.companyName).toBe(organisation.companyDetails.name)
    expect(result.registration).toEqual({
      id: registration.id,
      registrationNumber: 'R26ER5001180041PL',
      status: 'created',
      material: registration.material,
      processingType: 'reprocessor - input',
      site: registration.site.address.line1,
      town: registration.site.address.town,
      postcode: registration.site.address.postcode
    })
  })

  it('returns an accreditation the registration does not link to', async () => {
    const registration = aRegistration()
    const accreditation = anAccreditation()

    expect(
      await readAccreditations(
        anOrganisation(registration, [accreditation]),
        registration.id
      )
    ).toEqual([
      {
        id: accreditation.id,
        accreditationNumber: 'A26ER5001180114PL',
        status: 'approved',
        validFrom: '2026-07-01',
        validTo: '2026-12-31'
      }
    ])
  })

  it('returns an empty list when the registration holds no accreditation', async () => {
    const registration = aRegistration()

    expect(
      await readAccreditations(anOrganisation(registration), registration.id)
    ).toEqual([])
  })

  it('leaves out an accreditation that never got a number', async () => {
    const registration = aRegistration()

    expect(
      await readAccreditations(
        anOrganisation(registration, [anUnnumberedAccreditation()]),
        registration.id
      )
    ).toEqual([])
  })

  it('leaves out an accreditation for another site', async () => {
    const registration = aRegistration()
    const elsewhere = anAccreditation(ACCREDITATION_STATUS.APPROVED, {
      site: { address: { line1: 'Another site', postcode: 'BS1 4XE' } }
    })

    expect(
      await readAccreditations(
        anOrganisation(registration, [elsewhere]),
        registration.id
      )
    ).toEqual([])
  })

  it('returns two cancelled accreditations that share a key, newest first', async () => {
    const registration = aRegistration()
    const earlier = anAccreditation(ACCREDITATION_STATUS.CANCELLED, {
      accreditationNumber: 'A26ER5001180097PL',
      validFrom: '2026-02-15',
      validTo: '2026-03-31'
    })
    const later = anAccreditation(ACCREDITATION_STATUS.CANCELLED, {
      accreditationNumber: 'A26ER5001180114PL'
    })

    const accreditations = await readAccreditations(
      anOrganisation(registration, [earlier, later]),
      registration.id
    )

    expect(
      accreditations.map((accreditation) => accreditation.accreditationNumber)
    ).toEqual(['A26ER5001180114PL', 'A26ER5001180097PL'])
  })

  it('returns null dates for a numbered accreditation that carries none', async () => {
    const registration = aRegistration()
    const undated = anAccreditation(ACCREDITATION_STATUS.CANCELLED, {
      validFrom: undefined,
      validTo: undefined
    })

    const [accreditation] = await readAccreditations(
      anOrganisation(registration, [undated]),
      registration.id
    )

    expect(accreditation.validFrom).toBeNull()
    expect(accreditation.validTo).toBeNull()
  })

  it('returns a null registration number for a registration that carries none', async () => {
    const registration = aRegistration()

    const response = await readRegistration(
      anOrganisation(registration),
      registration.id
    )

    expect(
      JSON.parse(response.payload).registration.registrationNumber
    ).toBeNull()
  })

  it('returns a null site for an exporter registration', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })

    const response = await readRegistration(
      anOrganisation(registration),
      registration.id
    )

    const { registration: summary } = JSON.parse(response.payload)
    expect(summary.site).toBeNull()
    expect(summary.town).toBeNull()
    expect(summary.postcode).toBeNull()
    expect(summary.processingType).toBe('exporter')
  })

  it('returns 404 when the organisation holds no such registration', async () => {
    const response = await readRegistration(
      anOrganisation(aRegistration()),
      '68f6a147c117aec8a1ab74ff'
    )

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('access control', () => {
    const registration = aRegistration()
    const organisation = anOrganisation(registration, [anAccreditation()])

    /** @type {import('#test/create-test-server.js').TestServer} */
    let server

    const serveOrganisation = async () => {
      server = await createTestServer({
        repositories: {
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(organisation)
          ])
        }
      })

      return {
        method: 'GET',
        url: makePath(organisation.id, registration.id)
      }
    }

    it('refuses an operator holding only their own organisation read', async () => {
      const request = await serveOrganisation()

      const response = await server.inject({ ...request, ...asOperator() })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    testRegulatorCanRead({
      server: () => server,
      makeRequest: serveOrganisation
    })

    it('shows a regulator standard user the accredited periods', async () => {
      const request = await serveOrganisation()

      const response = await server.inject({
        ...request,
        headers: {
          Authorization: `Bearer ${entraIdMockAuthTokens.regulatorToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).accreditations).toEqual([
        {
          id: organisation.accreditations[0].id,
          accreditationNumber: 'A26ER5001180114PL',
          status: 'approved',
          validFrom: '2026-07-01',
          validTo: '2026-12-31'
        }
      ])
    })
  })
})
