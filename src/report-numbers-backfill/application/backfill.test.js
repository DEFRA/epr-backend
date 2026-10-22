import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillReportNumbers } from './backfill.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const unnumberedRegistrationId = '6512a0c2f1e4b8a9d0c3e444'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'
const missingRegistrationId = '6512a0c2f1e4b8a9d0c3e888'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL'
}

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    buildRegistration({
      id: registrationId,
      registrationNumber: numbers.registrationNumber
    }),
    buildRegistration({
      id: unnumberedRegistrationId,
      registrationNumber: null
    })
  ]
})

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

describe('backfillReportNumbers', () => {
  /** @type {ReportsRepository} */
  let reportsRepository
  /** @type {SystemLogsRepository} */
  let systemLogsRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {TypedLogger} */
  let logger

  beforeEach(() => {
    logger = createMockLogger()
    reportsRepository = createInMemoryReportsRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

  /** @param {boolean} isDryRun */
  const run = (isDryRun) =>
    backfillReportNumbers(
      {
        reportsRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )

  const createReport = async (overrides = {}) =>
    (
      await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId,
          registrationId,
          ...overrides
        })
      )
    ).id

  /** @param {string} id */
  const stored = (id) => reportsRepository.findReportById(id)

  const systemLogs = async () =>
    (await systemLogsRepository.find({ limit: 10 })).systemLogs

  const unmappedLines = () =>
    vi
      .mocked(logger.info)
      .mock.calls.map(([{ message }]) => message)
      .filter((message) => message?.startsWith('Report numbers unmapped'))

  it('adds the numbers each report lacks and audits each as the system user', async () => {
    const unnumbered = await createReport({ period: MONTHLY_PERIODS.January })
    const partlyNumbered = await createReport({
      period: MONTHLY_PERIODS.February,
      organisationNumber: numbers.organisationNumber
    })

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 2,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(unnumbered)).toMatchObject(numbers)
    expect(await stored(partlyNumbered)).toMatchObject(numbers)
    const logs = await systemLogs()
    expect(logs).toHaveLength(2)
    expect(logs).toContainEqual(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({
          action: 'numbers-backfill-migration'
        }),
        context: {
          reportId: partlyNumbered,
          organisationId,
          registrationId,
          next: { registrationNumber: numbers.registrationNumber }
        }
      })
    )
    expect(unmappedLines()).toEqual([])
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    const id = await createReport()

    expect(await run(true)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })

    expect(await stored(id)).not.toHaveProperty('organisationNumber')
    expect(await systemLogs()).toEqual([])
  })

  describe.each([
    ['a backfill', false],
    ['a dry run', true]
  ])('on %s', (_, isDryRun) => {
    it('logs one line for each report it cannot map, saying why', async () => {
      const organisationGone = await createReport({
        organisationId: missingOrganisationId
      })
      const unnumbered = await createReport({
        registrationId: unnumberedRegistrationId
      })
      const registrationGone = await createReport({
        registrationId: missingRegistrationId
      })

      expect(await run(isDryRun)).toEqual({
        missing: 3,
        mapped: 2,
        unmapped: 3,
        failed: 0,
        auditFailed: 0
      })

      expect(unmappedLines()).toEqual([
        `Report numbers unmapped: reportId=${organisationGone} organisationId=${missingOrganisationId} registrationId=${registrationId} reasons="organisation ${missingOrganisationId} not found"`,
        `Report numbers unmapped: reportId=${unnumbered} organisationId=${organisationId} registrationId=${unnumberedRegistrationId} reasons="registration ${unnumberedRegistrationId} has no registration number"`,
        `Report numbers unmapped: reportId=${registrationGone} organisationId=${organisationId} registrationId=${missingRegistrationId} reasons="organisation ${organisationId} holds no registration ${missingRegistrationId}"`
      ])
    })
  })

  it('still adds the number it can find to a report it cannot fully map', async () => {
    const id = await createReport({ registrationId: unnumberedRegistrationId })

    await run(false)

    expect(await stored(id)).toMatchObject({
      organisationNumber: numbers.organisationNumber
    })
    expect(await stored(id)).not.toHaveProperty('registrationNumber')
  })

  it('leaves only the unmapped reports for the next run', async () => {
    await createReport({ period: MONTHLY_PERIODS.January })
    await createReport({
      period: MONTHLY_PERIODS.February,
      organisationId: missingOrganisationId
    })
    await run(false)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 1,
      failed: 0,
      auditFailed: 0
    })
    expect(await systemLogs()).toHaveLength(1)
  })

  it('skips a report that has gone since it was listed', async () => {
    reportsRepository.findIdsWithoutNumbers = async () => [randomUUID()]

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })
  })

  it('counts a failed report read as a failure', async () => {
    const id = await createReport()
    const outage = new Error('connection lost')
    reportsRepository.findReportById = () => Promise.reject(outage)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 0,
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: outage,
      message: `Failed to backfill numbers for report ${id}`
    })
  })

  it('counts a failed organisation lookup as a failure, not as unmapped, and carries on', async () => {
    const failing = await createReport({
      period: MONTHLY_PERIODS.January,
      organisationId: missingOrganisationId
    })
    const written = await createReport({ period: MONTHLY_PERIODS.February })
    const outage = new Error('connection lost')
    const findById = organisationsRepository.findById
    organisationsRepository.findById = (id) =>
      id === missingOrganisationId ? Promise.reject(outage) : findById(id)

    expect(await run(false)).toEqual({
      missing: 2,
      mapped: 1,
      unmapped: 0,
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: outage,
      message: `Failed to backfill numbers for report ${failing}`
    })
    expect(await stored(written)).toMatchObject(numbers)
  })

  it('counts a written but unaudited report apart from failures', async () => {
    const id = await createReport()
    const auditError = new Error('system logs down')
    systemLogsRepository.insert = () => Promise.reject(auditError)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      failed: 0,
      auditFailed: 1
    })
    expect(await stored(id)).toMatchObject(numbers)
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message: `Numbers written but audit failed for report ${id}: {"organisationNumber":"500123","registrationNumber":"R25SR500010912PL"}`
    })
  })
})
