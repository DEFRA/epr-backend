import {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  accreditation,
  approvedOverseasSite,
  approvedTimeline,
  exporter,
  exporterAccreditation,
  overseasSites,
  pendingOverseasSite,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'

/** @import { OrganisationBuilders } from '#repositories/organisations/contract/test-data.js' */

export {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

/**
 * Builds accredited organisations with the caller's builders, so they draw
 * orgIds from the same sequence as the caller's other organisations.
 *
 * @param {OrganisationBuilders} builders
 */
export const createAccreditedOrganisationBuilder =
  ({ buildOrganisation }) =>
  (overrides = {}) => {
    const reprocessorAccreditation = accreditation()
    const exportAccreditation = exporterAccreditation()
    return buildOrganisation({
      registrations: [
        reprocessor({ accreditationId: reprocessorAccreditation.id }),
        exporter({ accreditationId: exportAccreditation.id })
      ],
      accreditations: [reprocessorAccreditation, exportAccreditation],
      ...overrides
    })
  }

/** What `buildAccreditedOrganisation` serves for its reprocessor while 2026 is open. */
export const reprocessorResponse = {
  status: { current: 'approved', timeline: approvedTimeline('2026-02-01') },
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
    2026: {
      accreditationNumber: ACCREDITATION_NUMBER,
      relevantYearOpen: true,
      status: { current: 'approved', timeline: approvedTimeline('2026-07-01') }
    }
  }
}

/** What `buildAccreditedOrganisation` serves for its exporter's accreditation. */
const exporterAccreditationResponse = {
  accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
  relevantYearOpen: true,
  status: { current: 'approved', timeline: approvedTimeline('2026-07-01') },
  overseasSites: {
    '001': { status: 'approved', approvedOn: '2026-01-01' },
    '002': { status: 'pending' }
  }
}

/** What `buildAccreditedOrganisation` serves for its exporter. */
export const exporterResponse = {
  status: { current: 'approved', timeline: approvedTimeline('2026-02-01') },
  validFrom: '2026-02-01',
  material: 'plastic',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'exporter',
  overseasSites: { '001': approvedOverseasSite, '002': pendingOverseasSite },
  accreditations: { 2026: exporterAccreditationResponse }
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
        overseasSitesRepository:
          createInMemoryOverseasSitesRepository(overseasSites)
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

  return { server: () => server, serve, serveStored, get }
}
