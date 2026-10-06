import { ObjectId } from 'mongodb'

import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'

export const REPROCESSOR_NUMBER = 'R26ER5001180041PL'
export const EXPORTER_NUMBER = 'R26EX5001180042PL'
export const ACCREDITATION_NUMBER = 'A26ER5001180114PL'
export const EXPORTER_ACCREDITATION_NUMBER = 'A26EX5001180115PL'

export const APPROVED_SITE_ID = new ObjectId().toString()
export const PENDING_SITE_ID = new ObjectId().toString()
export const MISSING_SITE_ID = new ObjectId().toString()

const approvedSite = {
  id: APPROVED_SITE_ID,
  name: 'Beta Reprocessor',
  country: 'Germany',
  address: { line1: '2 Teststrasse', townOrCity: 'Berlin', postcode: '10115' },
  coordinates: '52.5200,13.4050',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date()
}

const pendingSite = {
  id: PENDING_SITE_ID,
  name: 'Alpha Reprocessor',
  country: 'France',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', line2: null },
  createdAt: new Date(),
  updatedAt: new Date()
}

export const granted = (status) => [
  { status: 'created', updatedAt: '2026-01-01' },
  { status, updatedAt: '2026-02-01' }
]

export const accreditation = (overrides = {}) =>
  buildAccreditation({
    accreditationNumber: ACCREDITATION_NUMBER,
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: granted('approved'),
    ...overrides
  })

export const exporterAccreditation = (overrides = {}) =>
  accreditation({
    wasteProcessingType: 'exporter',
    accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
    ...overrides
  })

export const reprocessor = (overrides = {}) =>
  buildRegistration({
    registrationNumber: REPROCESSOR_NUMBER,
    reprocessingType: 'input',
    validFrom: '2026-02-01',
    statusHistory: granted('approved'),
    ...overrides
  })

export const exporter = (overrides = {}) =>
  buildRegistration({
    wasteProcessingType: 'exporter',
    registrationNumber: EXPORTER_NUMBER,
    validFrom: '2026-02-01',
    statusHistory: granted('approved'),
    overseasSites: {
      '001': { overseasSiteId: APPROVED_SITE_ID },
      '002': { overseasSiteId: PENDING_SITE_ID }
    },
    ...overrides
  })

export const reprocessorAt = (address) => {
  const registration = reprocessor()
  return { ...registration, site: { ...registration.site, address } }
}

export const buildAccreditedOrganisation = () => {
  const reprocessorAccreditation = accreditation()
  const exportAccreditation = exporterAccreditation()
  return buildOrganisation({
    registrations: [
      reprocessor({ accreditationId: reprocessorAccreditation.id }),
      exporter({ accreditationId: exportAccreditation.id })
    ],
    accreditations: [reprocessorAccreditation, exportAccreditation]
  })
}

export const approvedSiteView = {
  name: 'Beta Reprocessor',
  address: {
    line1: '2 Teststrasse',
    townOrCity: 'Berlin',
    postcode: '10115',
    country: 'Germany'
  },
  coordinates: '52.5200,13.4050'
}

export const pendingSiteView = {
  name: 'Alpha Reprocessor',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', country: 'France' }
}

export const body = (response) => JSON.parse(response.payload)

export const useViewServer = () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /**
   * @param {ReturnType<typeof createInMemoryOrganisationsRepository>} organisationsRepository
   */
  const start = async (organisationsRepository) => {
    server = await createTestServer({
      repositories: {
        organisationsRepository,
        overseasSitesRepository: createInMemoryOverseasSitesRepository([
          approvedSite,
          pendingSite
        ])
      }
    })
  }

  /**
   * Seeds the organisation as given, without repository validation.
   * @param {object} organisation
   */
  const serve = (organisation) =>
    start(createInMemoryOrganisationsRepository([partialMock(organisation)]))

  /**
   * Stores the organisation through the repository, as production writes it.
   * @param {object} organisation
   */
  const serveStored = async (organisation) => {
    const organisationsRepository = createInMemoryOrganisationsRepository([])
    await organisationsRepository().insert(partialMock(organisation))
    await start(organisationsRepository)
  }

  /**
   * @param {string} url
   * @param {object} [auth]
   */
  const get = (url, auth = asServiceMaintainer()) =>
    server.inject({ method: 'GET', url, ...auth })

  /**
   * @param {{ orgId: number }} organisation
   */
  const registrationsOf = async (organisation) => {
    await serve(organisation)
    return body(await get(`/organisations/${organisation.orgId}`)).registrations
  }

  return { server: () => server, serve, serveStored, get, registrationsOf }
}
