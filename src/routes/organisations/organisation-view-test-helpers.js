import { vi } from 'vitest'

import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'

/** @import { Organisation, StandingByYear } from '#organisation-read-model/domain/model.js' */

export const REPROCESSOR_NUMBER = 'R26ER5001180041PL'
export const EXPORTER_NUMBER = 'R26EX5001180042PL'
export const ACCREDITATION_NUMBER = 'A26ER5001180114PL'
export const EXPORTER_ACCREDITATION_NUMBER = 'A26EX5001180115PL'

export const approvedOverseasSite = {
  name: 'Beta Reprocessor',
  address: {
    line1: '2 Teststrasse',
    townOrCity: 'Berlin',
    postcode: '10115',
    country: 'Germany'
  },
  coordinates: '52.5200,13.4050'
}

export const pendingOverseasSite = {
  name: 'Alpha Reprocessor',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', country: 'France' }
}

/** @type {StandingByYear} */
const standingByDate = {
  2026: {
    '2026-02-01': { standing: 'registeredOnly' },
    '2026-07-01': { standing: 'accredited' }
  }
}

/**
 * An organisation in the read model's shape with an accredited reprocessor
 * and an accredited exporter, both for 2026.
 *
 * @param {Partial<Organisation>} [overrides]
 * @returns {Organisation}
 */
export const buildAccreditedOrganisation = (overrides = {}) =>
  buildReadOrganisation({
    registrations: {
      [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration({
        standingByDate,
        accreditations: {
          2026: buildReadAccreditation({
            accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER)
          })
        }
      }),
      [EXPORTER_NUMBER]: buildReadExporterRegistration({
        standingByDate,
        overseasSites: {
          '001': approvedOverseasSite,
          '002': pendingOverseasSite
        },
        accreditations: {
          2026: buildReadExporterAccreditation({
            accreditationNumber: toAccreditationNumber(
              EXPORTER_ACCREDITATION_NUMBER
            ),
            overseasSites: {
              '001': { status: 'approved', approvedOn: '2026-01-01' },
              '002': { status: 'pending' }
            }
          })
        }
      })
    },
    ...overrides
  })

/** What `buildAccreditedOrganisation` serves for its reprocessor while 2026 is open. */
export const reprocessorResponse = {
  status: approvedStatusFrom('2026-02-01'),
  standingByDate,
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
      prns: { open: true },
      status: approvedStatusFrom('2026-07-01')
    }
  }
}

/** What `buildAccreditedOrganisation` serves for its exporter while 2026 is open. */
export const exporterResponse = {
  status: approvedStatusFrom('2026-02-01'),
  standingByDate,
  material: 'plastic',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'exporter',
  overseasSites: { '001': approvedOverseasSite, '002': pendingOverseasSite },
  accreditations: {
    2026: {
      accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
      prns: { open: true },
      status: approvedStatusFrom('2026-07-01'),
      overseasSites: {
        '001': { status: 'approved', approvedOn: '2026-01-01' },
        '002': { status: 'pending' }
      }
    }
  }
}

export const body = (response) => JSON.parse(response.payload)

/**
 * A test server whose organisation read repository holds the organisations
 * given to `serve`, with `findByOrganisationNumber` spied on.
 */
export const useViewServer = () => {
  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /**
   * @param {...Organisation} organisations
   */
  const serve = async (...organisations) => {
    const repository = createInMemoryOrganisationReadRepository(organisations)()
    vi.spyOn(repository, 'findByOrganisationNumber')
    server = await createTestServer({
      repositories: { organisationReadRepository: () => repository }
    })
    return repository
  }

  /**
   * @param {string} url
   * @param {object} [auth]
   */
  const get = (url, auth = asServiceMaintainer()) =>
    server.inject({ method: 'GET', url, ...auth })

  return { server: () => server, serve, get }
}
