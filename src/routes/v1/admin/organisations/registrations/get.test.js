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
import {
  registrationAccreditationsGetPath,
  registrationGetPath
} from './get.js'

/** @import { AccreditationStatus, Organisation } from '#domain/organisations/model.js' */
/** @import { Accreditation, StatusHistoryEntry } from '#domain/organisations/accreditation.js' */

/**
 * The repository derives `status` on read, so the builders return an
 * organisation without one.
 * @typedef {Omit<Organisation, 'status'>} StoredOrganisation
 */

/**
 * @param {string} path
 * @param {string} organisationId
 * @param {string} registrationId
 */
const makePath = (path, organisationId, registrationId) =>
  path
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
 * @param {string} [path]
 */
const read = async (
  organisation,
  registrationId,
  path = registrationGetPath
) => {
  const server = await createTestServer({
    repositories: {
      organisationsRepository: createInMemoryOrganisationsRepository([
        partialMock(organisation)
      ])
    }
  })

  return server.inject({
    method: 'GET',
    url: makePath(path, organisation.id, registrationId),
    ...asServiceMaintainer()
  })
}

/**
 * @param {StoredOrganisation} organisation
 * @param {string} registrationId
 */
const readAccreditations = async (organisation, registrationId) => {
  const response = await read(
    organisation,
    registrationId,
    registrationAccreditationsGetPath
  )

  expect(response.statusCode).toBe(StatusCodes.OK)
  return JSON.parse(response.payload).accreditations
}

describe(`GET ${registrationGetPath}`, () => {
  setupAuthContext()

  it('returns the registration as the organisation holds it', async () => {
    const registration = aRegistration({
      registrationNumber: 'R26ER5001180041PL'
    })
    const organisation = anOrganisation(registration)

    const response = await read(organisation, registration.id)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual({
      id: registration.id,
      organisationId: organisation.id,
      orgName: registration.orgName,
      registrationNumber: 'R26ER5001180041PL',
      status: 'created',
      material: registration.material,
      glassRecyclingProcess: registration.glassRecyclingProcess,
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input',
      submittedToRegulator: registration.submittedToRegulator,
      validFrom: null,
      validTo: null,
      site: registration.site
    })
  })

  it('carries the whole site address, not the parts one page shows', async () => {
    const registration = aRegistration()
    const { site } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(site.address).toEqual(registration.site.address)
    expect(site.gridReference).toBe(registration.site.gridReference)
    expect(site.siteCapacity).toEqual(registration.site.siteCapacity)
  })

  it('carries a null site when the store holds none, as for an exporter', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })

    const response = await read(anOrganisation(registration), registration.id)

    const body = JSON.parse(response.payload)
    expect(body.site).toBeNull()
    expect(body.wasteProcessingType).toBe('exporter')
    expect(body.reprocessingType).toBeNull()
  })

  it('names the organisation only by the id in its own path', async () => {
    const registration = aRegistration()
    const organisation = anOrganisation(registration)

    const body = JSON.parse((await read(organisation, registration.id)).payload)

    expect(body.organisationId).toBe(organisation.id)
    expect(body).not.toHaveProperty('companyName')
  })

  it('returns a null registration number for a registration that carries none', async () => {
    const registration = aRegistration()

    const response = await read(anOrganisation(registration), registration.id)

    expect(JSON.parse(response.payload).registrationNumber).toBeNull()
  })

  it('returns 404 when the organisation holds no such registration', async () => {
    const response = await read(
      anOrganisation(aRegistration()),
      '68f6a147c117aec8a1ab74ff'
    )

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('access control', () => {
    const registration = aRegistration()
    const organisation = anOrganisation(registration)

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
        url: makePath(registrationGetPath, organisation.id, registration.id)
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
  })
})

describe(`GET ${registrationAccreditationsGetPath}`, () => {
  setupAuthContext()

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
        orgName: accreditation.orgName,
        accreditationNumber: 'A26ER5001180114PL',
        status: 'approved',
        material: accreditation.material,
        wasteProcessingType: accreditation.wasteProcessingType,
        reprocessingType: 'input',
        submittedToRegulator: accreditation.submittedToRegulator,
        validFrom: '2026-07-01',
        validTo: '2026-12-31',
        site: accreditation.site ?? null
      }
    ])
  })

  it('returns an accreditation no registration links to, which the validation rules report as orphaned', async () => {
    const registration = aRegistration()
    const orphan = anAccreditation()

    const accreditations = await readAccreditations(
      anOrganisation(registration, [orphan]),
      registration.id
    )

    expect(registration.accreditationId).toBeUndefined()
    expect(accreditations.map((a) => a.id)).toEqual([orphan.id])
  })

  it('returns an empty list when the registration holds no accreditation', async () => {
    const registration = aRegistration()

    expect(
      await readAccreditations(anOrganisation(registration), registration.id)
    ).toEqual([])
  })

  it('returns an accreditation that never got a number, with a null number', async () => {
    const registration = aRegistration()
    const unnumbered = anUnnumberedAccreditation()

    const accreditations = await readAccreditations(
      anOrganisation(registration, [unnumbered]),
      registration.id
    )

    expect(accreditations).toHaveLength(1)
    expect(accreditations[0].id).toBe(unnumbered.id)
    expect(accreditations[0].accreditationNumber).toBeNull()
    expect(accreditations[0].status).toBe('created')
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

  it('returns null dates for an accreditation that carries none', async () => {
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

  it('carries no site or reprocessing type for an exporter accreditation', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })
    const exporterAccreditation = buildAccreditation({
      wasteProcessingType: 'exporter',
      material: registration.material,
      accreditationNumber: 'A26ER5001180114PL',
      statusHistory: statusHistoryEndingIn(ACCREDITATION_STATUS.APPROVED)
    })

    const [accreditation] = await readAccreditations(
      anOrganisation(registration, [exporterAccreditation]),
      registration.id
    )

    expect(accreditation.site).toBeNull()
    expect(accreditation.reprocessingType).toBeNull()
    expect(accreditation.wasteProcessingType).toBe('exporter')
  })

  it('returns 404 when the organisation holds no such registration', async () => {
    const response = await read(
      anOrganisation(aRegistration()),
      '68f6a147c117aec8a1ab74ff',
      registrationAccreditationsGetPath
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
        url: makePath(
          registrationAccreditationsGetPath,
          organisation.id,
          registration.id
        )
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

    it('shows a regulator standard user the accreditations', async () => {
      const request = await serveOrganisation()

      const response = await server.inject({
        ...request,
        headers: {
          Authorization: `Bearer ${entraIdMockAuthTokens.regulatorToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(
        JSON.parse(response.payload).accreditations.map((a) => a.id)
      ).toEqual([organisation.accreditations[0].id])
    })
  })
})
