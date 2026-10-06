import { StatusCodes } from 'http-status-codes'

import {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  approvedOverseasSite,
  exporter,
  exporterAccreditation,
  overseasSites,
  pendingOverseasSite,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildLinkedDefraOrg,
  buildOrganisation
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

const reprocessorRegistration = {
  status: 'approved',
  validFrom: '2026-02-01',
  material: 'glass_re_melt',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'reprocessor',
  reprocessingType: 'input',
  site: {
    address: {
      line1: '7 Glass processing site',
      town: 'London',
      postcode: 'SW2A 0AA'
    }
  },
  accreditations: {
    2026: { accreditationNumber: ACCREDITATION_NUMBER, status: 'approved' }
  }
}

const exporterAccreditationResponse = {
  accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
  status: 'approved',
  overseasSites: {
    '001': { status: 'approved', approvedOn: '2026-01-01' },
    '002': { status: 'pending' }
  }
}

const exporterRegistration = {
  status: 'approved',
  validFrom: '2026-02-01',
  material: 'plastic',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'exporter',
  overseasSites: { '001': approvedOverseasSite, '002': pendingOverseasSite },
  accreditations: { 2026: exporterAccreditationResponse }
}

describe('organisation view routes', () => {
  setupAuthContext()

  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /**
   * @param {object} organisation
   */
  const serve = async (organisation) => {
    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        overseasSitesRepository:
          createInMemoryOverseasSitesRepository(overseasSites)
      }
    })
  }

  /**
   * @param {string} url
   * @param {object} [auth]
   */
  const get = (url, auth = asServiceMaintainer()) =>
    server.inject({ method: 'GET', url, ...auth })

  const body = (response) => JSON.parse(response.payload)

  const reprocessorAccreditation = accreditation()
  const exportAccreditation = exporterAccreditation()
  const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
  const organisation = buildOrganisation({
    registrations: [
      reprocessor({ accreditationId: reprocessorAccreditation.id }),
      exporter({ accreditationId: exportAccreditation.id })
    ],
    accreditations: [reprocessorAccreditation, exportAccreditation],
    linkedDefraOrganisation: linked
  })
  const organisationPath = `/organisations/${organisation.orgId}`
  const registrations = `${organisationPath}/registrations`
  const reprocessorPath = `${registrations}/${REPROCESSOR_NUMBER}`
  const exporterPath = `${registrations}/${EXPORTER_NUMBER}`

  describe('GET /organisations/{organisationNumber}', () => {
    it('serves the organisation without the fields that are not served', async () => {
      await serve(organisation)

      const response = await get(organisationPath)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({
        organisationNumber: organisation.orgId,
        name: 'ACME ltd',
        tradingName: 'ACME ltd',
        status: 'created',
        submittedToRegulator: { code: 'ea' },
        linkedDefraOrganisation: {
          defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
          linkedAt: linked.linkedAt,
          linkedBy: { email: 'linker@example.com' }
        },
        registrations: {
          [REPROCESSOR_NUMBER]: reprocessorRegistration,
          [EXPORTER_NUMBER]: exporterRegistration
        }
      })
    })

    it('returns 404 for an unknown organisation number', async () => {
      await serve(buildOrganisation({ orgId: 500001 }))

      const response = await get('/organisations/500002')

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('rejects an organisation number that is not a number', async () => {
      await serve(buildOrganisation())

      const response = await get('/organisations/not-a-number')

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    describe('authorisation', () => {
      const request = async () => {
        await serve(organisation)
        return { method: 'GET', url: organisationPath }
      }

      it('shows an operator their own organisation', async () => {
        const { url } = await request()

        const response = await get(url, asOperator())

        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('refuses a caller who holds no organisation read', async () => {
        const { url } = await request()

        const response = await get(url, asUnscopedAdminUser())

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })

      testRegulatorCanRead({ server: () => server, makeRequest: request })
    })
  })

  describe('sub-resources', () => {
    beforeEach(async () => {
      await serve(organisation)
    })

    it.each([
      ['an unknown registration', `${registrations}/R26XX0000000000PL`],
      [
        'an unknown accreditation year',
        `${reprocessorPath}/accreditations/2027`
      ]
    ])('returns 404 for %s', async (_, url) => {
      const response = await get(url)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('lists the granted registrations keyed by number', async () => {
      const response = await get(registrations)

      expect(body(response)).toEqual({
        registrations: {
          [REPROCESSOR_NUMBER]: reprocessorRegistration,
          [EXPORTER_NUMBER]: exporterRegistration
        }
      })
    })

    it('returns one registration by its number', async () => {
      const response = await get(exporterPath)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual(exporterRegistration)
    })

    it("returns a registration's accreditations keyed by year", async () => {
      const response = await get(`${reprocessorPath}/accreditations`)

      expect(body(response)).toEqual({
        accreditations: reprocessorRegistration.accreditations
      })
    })

    it("returns an exporter's accreditations with their overseas sites", async () => {
      const response = await get(`${exporterPath}/accreditations`)

      expect(body(response)).toEqual({
        accreditations: { 2026: exporterAccreditationResponse }
      })
    })

    it('returns one accreditation by its year, with its overseas sites embedded', async () => {
      const response = await get(`${exporterPath}/accreditations/2026`)

      expect(body(response)).toEqual(exporterAccreditationResponse)
    })

    it('returns one reprocessor accreditation by its year', async () => {
      const response = await get(`${reprocessorPath}/accreditations/2026`)

      expect(body(response)).toEqual({
        accreditationNumber: ACCREDITATION_NUMBER,
        status: 'approved'
      })
    })
  })
})
