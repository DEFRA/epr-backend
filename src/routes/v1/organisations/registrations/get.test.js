import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import {
  buildAccreditation,
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
      organisation: { id: organisation.id },
      registrationNumber: 'R26ER5001180041PL',
      status: 'created',
      material: 'glass_re_melt',
      reprocessingType: 'input',
      dateRange: { validFrom: null, validTo: null },
      accreditations: [],
      application: {
        orgName: registration.orgName,
        submittedToRegulator: registration.submittedToRegulator,
        material: 'glass',
        wasteProcessingType: 'reprocessor',
        cbduNumber: registration.cbduNumber,
        suppliers: registration.suppliers,
        plantEquipmentDetails: registration.plantEquipmentDetails,
        noticeAddress: registration.noticeAddress,
        exportPorts: null,
        wastePermits: registration.wasteManagementPermits,
        site: {
          address: registration.site.address,
          gridReference: registration.site.gridReference,
          capacity: registration.site.siteCapacity.map((entry) => ({
            material: entry.material,
            tonnes: entry.siteCapacityInTonnes,
            timescale: entry.siteCapacityTimescale
          }))
        }
      }
    })
  })

  it('carries the whole site address, not the parts one page shows', async () => {
    const registration = aRegistration()
    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.site.address).toEqual(registration.site.address)
    expect(application.site.gridReference).toBe(registration.site.gridReference)
  })

  it('names a capacity by what it is, not by the object that holds it', async () => {
    const registration = aRegistration()
    const [stored] = registration.site.siteCapacity

    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.site.capacity[0]).toEqual({
      material: stored.material,
      tonnes: stored.siteCapacityInTonnes,
      timescale: stored.siteCapacityTimescale
    })
  })

  it('carries a null site when the store holds none, as for an exporter', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })

    const response = await read(anOrganisation(registration), registration.id)

    const body = JSON.parse(response.payload)
    expect(body.application.site).toBeNull()
    expect(body.application.wasteProcessingType).toBe('exporter')
    expect(body.reprocessingType).toBeNull()
  })

  it('carries the exporter answers the reprocessor form never asks for', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })

    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.exportPorts).toEqual(registration.exportPorts)
    expect(application.plantEquipmentDetails).toBeNull()
    expect(application.wastePermits).toEqual([])
  })

  it('carries what authorises the site to handle the material', async () => {
    const registration = aRegistration()

    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.wastePermits).toEqual(
      registration.wasteManagementPermits
    )
    expect(application.cbduNumber).toBe(registration.cbduNumber)
    expect(application.suppliers).toBe(registration.suppliers)
  })

  it('carries a null waste carrier number for a registration whose regulator does not ask for one', async () => {
    const registration = aRegistration({ cbduNumber: undefined })

    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.cbduNumber).toBeNull()
  })

  it('carries a null notice address for a registration that holds none', async () => {
    const registration = aRegistration({ noticeAddress: undefined })

    const { application } = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(application.noticeAddress).toBeNull()
  })

  it('names no individual, the registration being a record a regulator reads', async () => {
    const registration = aRegistration()

    const body = JSON.parse(
      (await read(anOrganisation(registration), registration.id)).payload
    )

    expect(body.application).not.toHaveProperty('approvedPersons')
    expect(body.application).not.toHaveProperty('submitterContactDetails')
    expect(body.application).not.toHaveProperty('applicationContactDetails')
  })

  it('links the accreditation the registration holds, without folding it in', async () => {
    const accreditation = anAccreditation()
    const registration = aRegistration({ accreditationId: accreditation.id })

    const body = JSON.parse(
      (
        await read(
          anOrganisation(registration, [accreditation]),
          registration.id
        )
      ).payload
    )

    expect(body.accreditations).toEqual([
      {
        id: accreditation.id,
        accreditationNumber: 'A26ER5001180114PL',
        status: 'approved'
      }
    ])
  })

  it('links an accreditation whatever its status, a cancelled one being a fact about the registration', async () => {
    const cancelled = anAccreditation(ACCREDITATION_STATUS.CANCELLED)
    const registration = aRegistration({ accreditationId: cancelled.id })

    const body = JSON.parse(
      (await read(anOrganisation(registration, [cancelled]), registration.id))
        .payload
    )

    expect(body.accreditations).toEqual([
      {
        id: cancelled.id,
        accreditationNumber: 'A26ER5001180114PL',
        status: 'cancelled'
      }
    ])
  })

  it('links an unnumbered accreditation with a null number', async () => {
    const unnumbered = anUnnumberedAccreditation()
    const registration = aRegistration({ accreditationId: unnumbered.id })

    const body = JSON.parse(
      (await read(anOrganisation(registration, [unnumbered]), registration.id))
        .payload
    )

    expect(body.accreditations).toEqual([
      { id: unnumbered.id, accreditationNumber: null, status: 'created' }
    ])
  })

  it('resolves the glass process as the material the registration is for, glass being the only one that sub-divides', async () => {
    const registration = aRegistration()

    const response = await read(anOrganisation(registration), registration.id)

    const body = JSON.parse(response.payload)
    expect(registration.material).toBe('glass')
    expect(registration.glassRecyclingProcess).toEqual(['glass_re_melt'])
    expect(body.material).toBe('glass_re_melt')
    expect(body).not.toHaveProperty('glassRecyclingProcess')
    expect(body.application).not.toHaveProperty('glassRecyclingProcess')
  })

  it('keeps the material the applicant applied for in the application, beside the resolved one', async () => {
    const registration = aRegistration()

    const response = await read(anOrganisation(registration), registration.id)

    expect(JSON.parse(response.payload).application.material).toBe('glass')
  })

  it('reports a material that does not sub-divide unchanged, in both places', async () => {
    const registration = buildRegistration({ material: 'plastic' })

    const response = await read(anOrganisation(registration), registration.id)

    const body = JSON.parse(response.payload)
    expect(body.material).toBe('plastic')
    expect(body.application.material).toBe('plastic')
  })

  it('carries no material at all for a registration that has not resolved one', async () => {
    const registration = aRegistration({
      material: 'glass',
      glassRecyclingProcess: []
    })

    const response = await read(anOrganisation(registration), registration.id)

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body).not.toHaveProperty('material')
    expect(body.application.material).toBe('glass')
  })

  it('keeps the name the applicant typed inside the application, not beside the id', async () => {
    const registration = aRegistration()
    const organisation = anOrganisation(registration)

    const body = JSON.parse((await read(organisation, registration.id)).payload)

    expect(body.organisation).toEqual({ id: organisation.id })
    expect(body.application.orgName).toBe(registration.orgName)
    expect(body).not.toHaveProperty('orgName')
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

    it('shows an operator the registration of their own organisation', async () => {
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

describe(`GET ${registrationAccreditationsGetPath}`, () => {
  setupAuthContext()

  it('returns the accreditation the registration links to', async () => {
    const accreditation = anAccreditation()
    const registration = aRegistration({ accreditationId: accreditation.id })

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
        material: 'glass_re_melt',
        reprocessingType: 'input',
        dateRange: { validFrom: '2026-07-01', validTo: '2026-12-31' },
        application: {
          orgName: accreditation.orgName,
          submittedToRegulator: accreditation.submittedToRegulator,
          material: 'glass',
          wasteProcessingType: accreditation.wasteProcessingType
        }
      }
    ])
  })

  it('returns an empty list when the registration links to no accreditation', async () => {
    const registration = aRegistration()

    expect(
      await readAccreditations(
        anOrganisation(registration, [anAccreditation()]),
        registration.id
      )
    ).toEqual([])
  })

  it('returns an empty list when the link names an accreditation the organisation does not hold', async () => {
    const registration = aRegistration({
      accreditationId: '68f6a147c117aec8a1ab74ff'
    })

    expect(
      await readAccreditations(
        anOrganisation(registration, [anAccreditation()]),
        registration.id
      )
    ).toEqual([])
  })

  it('returns an accreditation that never got a number, with a null number', async () => {
    const unnumbered = anUnnumberedAccreditation()
    const registration = aRegistration({ accreditationId: unnumbered.id })

    const accreditations = await readAccreditations(
      anOrganisation(registration, [unnumbered]),
      registration.id
    )

    expect(accreditations).toHaveLength(1)
    expect(accreditations[0].id).toBe(unnumbered.id)
    expect(accreditations[0].accreditationNumber).toBeNull()
    expect(accreditations[0].status).toBe('created')
  })

  it('returns null dates for an accreditation that carries none', async () => {
    const undated = anAccreditation(ACCREDITATION_STATUS.CANCELLED, {
      validFrom: undefined,
      validTo: undefined
    })
    const registration = aRegistration({ accreditationId: undated.id })

    const [accreditation] = await readAccreditations(
      anOrganisation(registration, [undated]),
      registration.id
    )

    expect(accreditation.dateRange).toEqual({
      validFrom: null,
      validTo: null
    })
  })

  it('keeps a range that carries only a start, rather than dropping the date', async () => {
    const openEnded = anAccreditation(ACCREDITATION_STATUS.CANCELLED, {
      validTo: undefined
    })
    const registration = aRegistration({ accreditationId: openEnded.id })

    const [accreditation] = await readAccreditations(
      anOrganisation(registration, [openEnded]),
      registration.id
    )

    expect(accreditation.dateRange).toEqual({
      validFrom: '2026-07-01',
      validTo: null
    })
  })

  it('carries no reprocessing type for an exporter accreditation', async () => {
    const exporterAccreditation = buildAccreditation({
      wasteProcessingType: 'exporter',
      accreditationNumber: 'A26ER5001180114PL',
      statusHistory: statusHistoryEndingIn(ACCREDITATION_STATUS.APPROVED)
    })
    const registration = buildRegistration({
      wasteProcessingType: 'exporter',
      accreditationId: exporterAccreditation.id
    })

    const [accreditation] = await readAccreditations(
      anOrganisation(registration, [exporterAccreditation]),
      registration.id
    )

    expect(accreditation.reprocessingType).toBeNull()
    expect(accreditation.application.wasteProcessingType).toBe('exporter')
  })

  it('carries no material at all for an accreditation that has not resolved one', async () => {
    const unresolved = anAccreditation(ACCREDITATION_STATUS.APPROVED, {
      glassRecyclingProcess: []
    })
    const registration = aRegistration({ accreditationId: unresolved.id })

    const [returned] = await readAccreditations(
      anOrganisation(registration, [unresolved]),
      registration.id
    )

    expect(returned).not.toHaveProperty('material')
    expect(returned.application.material).toBe('glass')
  })

  it('leaves the site to the registration, which already carries it', async () => {
    const accreditation = anAccreditation()
    const registration = aRegistration({ accreditationId: accreditation.id })

    const [returned] = await readAccreditations(
      anOrganisation(registration, [accreditation]),
      registration.id
    )

    expect(returned).not.toHaveProperty('site')
    expect(returned.application).not.toHaveProperty('site')
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
    const accreditation = anAccreditation()
    const registration = aRegistration({ accreditationId: accreditation.id })
    const organisation = anOrganisation(registration, [accreditation])

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

    it('shows an operator the accreditations of their own organisation', async () => {
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
