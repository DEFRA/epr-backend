import { StatusCodes } from 'http-status-codes'
import { delay, http, HttpResponse } from 'msw'

import { expectedSignature } from '#common/helpers/reg-accred-signed-headers-test-helpers.js'
import {
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  createInMemoryOrganisationReadRepository
} from '#organisation-read-model/test-support.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { adminRegistrationServiceOverseasSitesListPath } from './admin-registration-service-list.js'

/** @import { Organisation } from '#organisation-read-model/vocabulary.js' */

const regAccredApi = {
  baseUrl: 'https://registration-service.test',
  clientId: 'epr-ReEx-Client',
  sharedSecret: 'secret'
}

const REGISTRATION_URL = `${regAccredApi.baseUrl}/v1/organisations/:organisationNumber/registrations/:registrationNumber`

const ALPHA_REGISTRATION = toRegistrationNumber('R27EX5001180042PL')
const BETA_REGISTRATION = toRegistrationNumber('R27EX5001180043GL')
const REPROCESSOR_REGISTRATION = toRegistrationNumber('R27ER5001180044PL')

const alphaOrganisation = buildReadOrganisation({
  registrations: {
    [ALPHA_REGISTRATION]: buildReadExporterRegistration(),
    [REPROCESSOR_REGISTRATION]: buildReadReprocessorRegistration()
  }
})

const betaOrganisation = buildReadOrganisation({
  registrations: {
    [BETA_REGISTRATION]: buildReadExporterRegistration({
      material: 'glass_other'
    })
  }
})

const fullSite = {
  siteId: 2,
  orsId: '001',
  siteName: 'Alpha Reprocessor',
  formattedAddress: '1 Rue de Test, Zone 2, Paris, France',
  address: {
    line1: '1 Rue de Test',
    line2: 'Zone 2',
    town: 'Paris',
    country: 'France'
  },
  coordinates: '48.8566,2.3522',
  selected: true
}

const unnumberedSite = {
  siteId: 1,
  orsId: null,
  siteName: 'Beta Reprocessor',
  selected: false
}

/** A registration as the registration service serves it. */
const alphaRegistration = {
  organisationNumber: Number(alphaOrganisation.organisationNumber),
  registrationNumber: ALPHA_REGISTRATION,
  applications: [
    {
      year: 2027,
      applicationReference: 'APP-0001',
      applicationStatus: 'Approved',
      accreditationNumber: 'A27EX5001180042PL',
      overseasSites: [unnumberedSite, fullSite]
    },
    {
      year: 2028,
      applicationStatus: 'Started',
      overseasSites: []
    }
  ]
}

const alphaRow = {
  orgId: Number(alphaOrganisation.organisationNumber),
  registrationNumber: ALPHA_REGISTRATION,
  packagingWasteCategory: 'plastic',
  year: 2027,
  applicationReference: 'APP-0001',
  applicationStatus: 'Approved',
  accreditationNumber: 'A27EX5001180042PL'
}

const unnumberedSiteRow = {
  ...alphaRow,
  siteId: 1,
  orsId: null,
  selected: false,
  overseasReprocessorName: 'Beta Reprocessor',
  formattedAddress: null,
  destinationCountry: null,
  addressLine1: null,
  addressLine2: null,
  cityOrTown: null,
  coordinates: null
}

const fullSiteRow = {
  ...alphaRow,
  siteId: 2,
  orsId: '001',
  selected: true,
  overseasReprocessorName: 'Alpha Reprocessor',
  formattedAddress: '1 Rue de Test, Zone 2, Paris, France',
  destinationCountry: 'France',
  addressLine1: '1 Rue de Test',
  addressLine2: 'Zone 2',
  cityOrTown: 'Paris',
  coordinates: '48.8566,2.3522'
}

const notFound = () =>
  HttpResponse.json(
    { code: 'not_found', title: 'Not Found', status: 404 },
    { status: 404, headers: { 'content-type': 'application/problem+json' } }
  )

const mswServer = setupAuthContext().getServer()

/**
 * Serves `registrations` by registration number, and a 404 for any other.
 *
 * @param {Record<string, object>} registrations
 * @param {Request[]} [requests] - collects each request the service receives
 */
const serveRegistrations = (registrations, requests = []) =>
  mswServer.use(
    http.get(REGISTRATION_URL, ({ request, params }) => {
      requests.push(request)
      const registration = registrations[String(params.registrationNumber)]
      return registration ? HttpResponse.json(registration) : notFound()
    })
  )

/**
 * @param {Organisation[]} organisations
 * @param {object} [config]
 */
const serverWith = (organisations, config = { regAccredApi }) =>
  createTestServer({
    config,
    repositories: {
      organisationReadRepository:
        createInMemoryOrganisationReadRepository(organisations)
    }
  })

const list = (server) =>
  server.inject({
    method: 'GET',
    url: adminRegistrationServiceOverseasSitesListPath,
    ...asServiceMaintainer()
  })

describe(`${adminRegistrationServiceOverseasSitesListPath} route`, () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it("returns a row per overseas site on each of an exporter registration's applications, with the application's year, reference, status and accreditation number", async () => {
    serveRegistrations({ [ALPHA_REGISTRATION]: alphaRegistration })
    server = await serverWith([alphaOrganisation])

    const response = await list(server)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({
      rows: [unnumberedSiteRow, fullSiteRow]
    })
  })

  it('gives an application without a reference or accreditation number null for them', async () => {
    serveRegistrations({
      [ALPHA_REGISTRATION]: {
        ...alphaRegistration,
        applications: [
          {
            year: 2027,
            applicationStatus: 'Started',
            overseasSites: [fullSite]
          }
        ]
      }
    })
    server = await serverWith([alphaOrganisation])

    const response = await list(server)

    expect(JSON.parse(response.payload).rows).toStrictEqual([
      {
        ...fullSiteRow,
        applicationReference: null,
        applicationStatus: 'Started',
        accreditationNumber: null
      }
    ])
  })

  it('orders the rows by registration number, keeping the order the registration service gives within each', async () => {
    serveRegistrations({
      [ALPHA_REGISTRATION]: alphaRegistration,
      [BETA_REGISTRATION]: {
        organisationNumber: Number(betaOrganisation.organisationNumber),
        registrationNumber: BETA_REGISTRATION,
        applications: [
          {
            year: 2027,
            applicationStatus: 'Submitted',
            overseasSites: [{ ...fullSite, siteId: 7, orsId: '000' }]
          }
        ]
      }
    })
    server = await serverWith([betaOrganisation, alphaOrganisation])

    const response = await list(server)

    expect(
      JSON.parse(response.payload).rows.map(
        ({ registrationNumber, siteId }) => [registrationNumber, siteId]
      )
    ).toStrictEqual([
      [ALPHA_REGISTRATION, 1],
      [ALPHA_REGISTRATION, 2],
      [BETA_REGISTRATION, 7]
    ])
  })

  it('takes the packaging waste category from the registration', async () => {
    serveRegistrations({
      [BETA_REGISTRATION]: {
        ...alphaRegistration,
        registrationNumber: BETA_REGISTRATION,
        applications: [alphaRegistration.applications[0]]
      }
    })
    server = await serverWith([betaOrganisation])

    const response = await list(server)

    expect(
      JSON.parse(response.payload).rows.map((row) => row.packagingWasteCategory)
    ).toStrictEqual(['glass_other', 'glass_other'])
  })

  it('leaves out a registration the registration service holds no application for', async () => {
    serveRegistrations({})
    server = await serverWith([alphaOrganisation])

    const response = await list(server)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ rows: [] })
  })

  it('asks the registration service about exporter registrations only, signing each request', async () => {
    /** @type {Request[]} */
    const requests = []
    serveRegistrations({ [ALPHA_REGISTRATION]: alphaRegistration }, requests)
    server = await serverWith([alphaOrganisation])

    await list(server)

    expect(
      requests.map((request) => new URL(request.url).pathname)
    ).toStrictEqual([
      `/v1/organisations/${alphaOrganisation.organisationNumber}/registrations/${ALPHA_REGISTRATION}`
    ])
    expect(requests[0].headers.get('x-cdp-client-id')).toBe(
      regAccredApi.clientId
    )
    expect(requests[0].headers.get('x-cdp-auth-signature')).toBe(
      expectedSignature(requests[0].headers, regAccredApi.sharedSecret)
    )
  })

  it('asks about no more than five registrations at once', async () => {
    const organisations = Array.from({ length: 12 }, (_, index) =>
      buildReadOrganisation({
        registrations: {
          [toRegistrationNumber(
            `R27EX50011801${String(index).padStart(2, '0')}PL`
          )]: buildReadExporterRegistration()
        }
      })
    )
    let inFlight = 0
    let mostInFlight = 0
    mswServer.use(
      http.get(REGISTRATION_URL, async () => {
        inFlight++
        mostInFlight = Math.max(mostInFlight, inFlight)
        await delay(5)
        inFlight--
        return notFound()
      })
    )
    server = await serverWith(organisations)

    const response = await list(server)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(mostInFlight).toBe(5)
  })

  it.for([
    {
      when: 'the registration service fails',
      respond: () => HttpResponse.json({}, { status: 500 })
    },
    {
      when: 'the registration service refuses the signature',
      respond: () => HttpResponse.json({}, { status: 401 })
    },
    {
      when: 'the registration service serves something that is not a registration',
      respond: () => HttpResponse.json({ applications: [{ year: 2027 }] })
    }
  ])('answers 502 when $when', async ({ respond }) => {
    mswServer.use(http.get(REGISTRATION_URL, respond))
    server = await serverWith([alphaOrganisation])

    const response = await list(server)

    expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
    expect(server.loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Failure on ${adminRegistrationServiceOverseasSitesListPath}`
      })
    )
  })

  it('answers 502 when the registration service takes longer than 10 seconds', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() =>
        AbortSignal.abort(new DOMException('', 'TimeoutError'))
      )
    mswServer.use(
      http.get(REGISTRATION_URL, () => HttpResponse.json(alphaRegistration))
    )
    server = await serverWith([alphaOrganisation])

    const response = await list(server)

    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
    timeout.mockRestore()
  })

  it('answers 503 when the connection to the registration service has no shared secret', async () => {
    server = await serverWith([alphaOrganisation], {
      regAccredApi: { ...regAccredApi, sharedSecret: '' }
    })

    const response = await list(server)

    expect(response.statusCode).toBe(StatusCodes.SERVICE_UNAVAILABLE)
  })

  it('answers 401 when not authenticated', async () => {
    server = await serverWith([])

    const response = await server.inject({
      method: 'GET',
      url: adminRegistrationServiceOverseasSitesListPath
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('answers 403 to an operator', async () => {
    server = await serverWith([])

    const response = await server.inject({
      method: 'GET',
      url: adminRegistrationServiceOverseasSitesListPath,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
})
