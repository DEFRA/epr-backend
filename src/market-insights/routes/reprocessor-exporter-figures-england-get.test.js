import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asRegulator,
  asServiceMaintainerRead
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { ObjectId } from 'mongodb'
import {
  MATERIAL,
  REGULATOR,
  REPROCESSING_TYPE,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import {
  marketInsightsEnglandReprocessorExporterFiguresPath,
  marketInsightsReprocessorExporterFiguresPath
} from './reprocessor-exporter-figures-get.js'

/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */

/**
 * @param {string} path
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 */
const pathFor = (path, year, cadence, period) =>
  path
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const JANUARY_2026 = pathFor(
  marketInsightsEnglandReprocessorExporterFiguresPath,
  2026,
  'monthly',
  1
)

/**
 * An approved plastic reprocessor accredited for 2026 whose accreditation the
 * given regulator holds, written through the organisations fixture so the
 * document is one the write schema accepts.
 *
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @param {import('#domain/organisations/model.js').RegulatorValue} regulator
 */
const insertAccreditedOperator = async (organisationsRepository, regulator) => {
  const accreditationId = new ObjectId().toString()
  const registration = buildRegistration({
    accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null,
    submittedToRegulator: regulator
  })
  const accreditation = buildAccreditation({
    id: accreditationId,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    glassRecyclingProcess: null,
    submittedToRegulator: regulator
  })
  const organisation = await buildApprovedOrg(
    organisationsRepository,
    { registrations: [registration], accreditations: [accreditation] },
    { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }
  )
  return { organisationId: organisation.id, registrationId: registration.id }
}

/**
 * @param {{ organisationId: string, registrationId: string }} operator
 * @param {number} issuedTonnage
 */
const januaryPrns = (operator, issuedTonnage) => ({
  ...operator,
  year: 2026,
  cadence: 'monthly',
  period: 1,
  prn: {
    issuedTonnage,
    freeTonnage: 0,
    totalRevenue: issuedTonnage * 100,
    averagePricePerTonne: 100
  }
})

describe(`GET ${marketInsightsEnglandReprocessorExporterFiguresPath}`, () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server

  beforeAll(async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository()()
    const reportsRepository = createInMemoryReportsRepository()()
    const english = await insertAccreditedOperator(
      organisationsRepository,
      REGULATOR.EA
    )
    const welsh = await insertAccreditedOperator(
      organisationsRepository,
      REGULATOR.NRW
    )
    await buildSubmittedReport(reportsRepository, januaryPrns(english, 100))
    await buildSubmittedReport(reportsRepository, januaryPrns(welsh, 50))
    server = await createTestServer({
      repositories: { organisationsRepository, reportsRepository }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  /**
   * @param {ReturnType<typeof asRegulator>} credentials
   * @param {string} [url]
   */
  const get = (credentials, url = JANUARY_2026) =>
    server.inject({ method: 'GET', url, ...credentials })

  describe('access control', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({ method: 'GET', url: JANUARY_2026 })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator, who holds no market-data.read', async () => {
      const response = await get(asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for an admin tier, which holds market-data.read', async () => {
      const response = await get(asServiceMaintainerRead())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a regulator, who holds market-data.read', async () => {
      const response = await get(asRegulator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  it('rejects a quarterly period, as the UK figures do', async () => {
    const response = await get(
      asRegulator(),
      pathFor(
        marketInsightsEnglandReprocessorExporterFiguresPath,
        2026,
        'quarterly',
        1
      )
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('serves the accreditations the Environment Agency holds and leaves the other regulators out', async () => {
    const [england, uk] = await Promise.all([
      get(asRegulator()),
      get(
        asRegulator(),
        pathFor(
          marketInsightsReprocessorExporterFiguresPath,
          2026,
          'monthly',
          1
        )
      )
    ])

    expect(england.statusCode).toBe(StatusCodes.OK)
    /** @type {ReprocessorExporterTable} */
    const englandPayload = JSON.parse(england.payload)
    /** @type {ReprocessorExporterTable} */
    const ukPayload = JSON.parse(uk.payload)
    const january = englandPayload.data.months['2026-01']
    expect(Object.keys(january.figures)).toEqual([
      ...TONNAGE_MONITORING_MATERIALS
    ])
    expect(
      january.figures[MATERIAL.PLASTIC][WASTE_PROCESSING_TYPE.REPROCESSOR]
    ).toEqual(
      expect.objectContaining({
        revisedTonnageIssued: 100,
        totalRevenue: 10000
      })
    )
    expect(
      ukPayload.data.months['2026-01'].figures[MATERIAL.PLASTIC][
        WASTE_PROCESSING_TYPE.REPROCESSOR
      ]
    ).toEqual(
      expect.objectContaining({
        revisedTonnageIssued: 150,
        totalRevenue: 15000
      })
    )
  })

  it('answers zero where England has no activity', async () => {
    const response = await get(asRegulator())

    /** @type {ReprocessorExporterTable} */
    const payload = JSON.parse(response.payload)
    const january = payload.data.months['2026-01']
    expect(
      january.figures[MATERIAL.WOOD][WASTE_PROCESSING_TYPE.EXPORTER]
    ).toEqual(
      expect.objectContaining({
        tonnageExported: 0,
        revisedTonnageIssued: 0,
        averagePricePerTonne: 0
      })
    )
  })
})
