import { StatusCodes } from 'http-status-codes'

import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { REPROCESSING_TYPE } from '#domain/organisations/model.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  exporterAccreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

const cancelledAfterApproval = [
  { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
  { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
  { status: 'cancelled', updatedAt: '2026-11-01T09:00:00.000Z' }
]

/**
 * @param {object} accreditationOverrides
 * @param {{ exporting?: boolean }} [options]
 */
const organisationWith = (
  accreditationOverrides,
  { exporting = false } = {}
) => {
  const accredited = exporting
    ? exporterAccreditation(accreditationOverrides)
    : accreditation({
        reprocessingType: REPROCESSING_TYPE.OUTPUT,
        ...accreditationOverrides
      })
  const registration = (exporting ? exporter : reprocessor)({
    accreditationId: accredited.id
  })
  return buildOrganisation({
    statusHistory: [
      { status: 'approved', updatedAt: new Date('2026-01-01T00:00:00.000Z') }
    ],
    registrations: [registration],
    accreditations: [accredited]
  })
}

/**
 * @param {{ orgId: number }} organisation
 * @param {string} [registrationNumber]
 */
const eligibilityUrl = ({ orgId }, registrationNumber = REPROCESSOR_NUMBER) =>
  `/organisations/${orgId}/registrations/${registrationNumber}/accreditations/2026/packaging-recycling-notes/december-prn-eligibility`

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/accreditations/{year}/packaging-recycling-notes/december-prn-eligibility', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {OrganisationsRepository} */
  let organisationsRepository

  /** @param {ReturnType<typeof buildOrganisation>} organisation */
  const startServer = async (organisation) => {
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
    server = await createTestServer({
      repositories: { organisationsRepository: () => organisationsRepository }
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
    const organisation = organisationWith({})

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

    it('returns 500 when the repository fails unexpectedly', async () => {
      vi.spyOn(
        organisationsRepository,
        'findAccreditationById'
      ).mockRejectedValueOnce(new Error('database unavailable'))

      const response = await eligibility(eligibilityUrl(organisation))

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
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
    const organisation = organisationWith({}, { exporting: true })
    await startServer(organisation)

    const response = await eligibility(
      eligibilityUrl(organisation, EXPORTER_NUMBER)
    )

    expect(response.body).toStrictEqual({ mode: 'pool', windowOpen: true })
  })

  it('reports the real mode for an accreditation cancelled after approval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))
    const organisation = organisationWith({
      status: 'cancelled',
      statusHistory: cancelledAfterApproval
    })
    await startServer(organisation)

    const response = await eligibility(eligibilityUrl(organisation))

    expect(response).toStrictEqual({
      statusCode: StatusCodes.OK,
      body: { mode: 'manual', windowOpen: true }
    })
  })
})
