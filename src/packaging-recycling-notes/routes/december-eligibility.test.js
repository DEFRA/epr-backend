import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { REPROCESSING_TYPE } from '#domain/organisations/model.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

const approved = approvedTimelineFrom('2026-07-01')

const cancelledAfterApproval = {
  current: /** @type {const} */ ('cancelled'),
  timeline: [
    ...approved,
    {
      status: 'cancelled',
      at: '2026-11-01T09:00:00.000Z',
      updatedAt: '2026-11-01T09:00:00.000Z'
    }
  ]
}

/**
 * @param {{
 *   exporting?: boolean,
 *   reprocessingType?: 'input' | 'output',
 *   status?: { current: 'approved' | 'cancelled', timeline: import('#organisation-read-model/domain/model.js').StatusTimeline }
 * }} [options]
 */
const organisationWith = ({
  exporting = false,
  reprocessingType = REPROCESSING_TYPE.OUTPUT,
  status = { current: 'approved', timeline: approved }
} = {}) => {
  const accredited = buildReadAccreditation({
    accreditationNumber: toAccreditationNumber(
      exporting ? EXPORTER_ACCREDITATION_NUMBER : ACCREDITATION_NUMBER
    ),
    status
  })
  return buildReadOrganisation({
    registrations: exporting
      ? {
          [EXPORTER_NUMBER]: buildReadExporterRegistration({
            accreditations: { 2026: buildReadExporterAccreditation(accredited) }
          })
        }
      : {
          [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration({
            reprocessingType,
            accreditations: { 2026: accredited }
          })
        }
  })
}

/**
 * @param {{ organisationNumber: OrganisationNumber }} organisation
 * @param {string} [registrationNumber]
 */
const eligibilityUrl = (
  { organisationNumber },
  registrationNumber = REPROCESSOR_NUMBER
) =>
  `/organisations/${organisationNumber}/registrations/${registrationNumber}/accreditations/2026/packaging-recycling-notes/december-prn-eligibility`

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/accreditations/{year}/packaging-recycling-notes/december-prn-eligibility', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server

  /** @param {import('#organisation-read-model/domain/model.js').Organisation} organisation */
  const startServer = async (organisation) => {
    server = await createTestServer({
      repositories: {
        organisationReadRepository: createInMemoryOrganisationReadRepository([
          organisation
        ])
      }
    })
  }

  /** @param {string} url */
  const eligibility = async (url) => {
    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })
    return {
      statusCode: response.statusCode,
      body: JSON.parse(response.payload)
    }
  }

  afterEach(async () => {
    vi.useRealTimers()
    await server.stop()
  })

  describe('for an output reprocessor', () => {
    const organisation = organisationWith()

    beforeEach(() => startServer(organisation))

    it.each([
      ['within the December window', '2026-12-15T12:00:00.000Z', true],
      ['outside the December window', '2026-08-15T12:00:00.000Z', false],
      [
        'in January the year after the accreditation year',
        '2027-01-31T23:59:00.000Z',
        true
      ],
      ['the day after the deadline', '2027-02-01T00:00:00.000Z', false]
    ])('declares manually, with the window %s', async (_, now, windowOpen) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(now))

      const response = await eligibility(eligibilityUrl(organisation))

      expect(response).toStrictEqual({
        statusCode: StatusCodes.OK,
        body: { mode: 'manual', windowOpen }
      })
    })
  })

  it('chooses a pool for an input reprocessor, even when the window is open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
    const organisation = organisationWith({
      reprocessingType: REPROCESSING_TYPE.INPUT
    })
    await startServer(organisation)

    const response = await eligibility(eligibilityUrl(organisation))

    expect(response.body).toStrictEqual({ mode: 'pool', windowOpen: true })
  })

  it('chooses a pool for an exporter, even when the window is open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
    const organisation = organisationWith({ exporting: true })
    await startServer(organisation)

    const response = await eligibility(
      eligibilityUrl(organisation, EXPORTER_NUMBER)
    )

    expect(response.body).toStrictEqual({ mode: 'pool', windowOpen: true })
  })

  it('reports the real mode for an accreditation cancelled after approval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
    const organisation = organisationWith({ status: cancelledAfterApproval })
    await startServer(organisation)

    const response = await eligibility(eligibilityUrl(organisation))

    expect(response).toStrictEqual({
      statusCode: StatusCodes.OK,
      body: { mode: 'manual', windowOpen: true }
    })
  })
})
