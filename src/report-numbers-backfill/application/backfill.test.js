import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillReportNumbers } from './backfill.js'

vi.mock('@defra/cdp-auditing', () => ({ audit: vi.fn() }))

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const accreditationId = '6512a0c2f1e4b8a9d0c3e333'
const unnumberedRegistrationId = '6512a0c2f1e4b8a9d0c3e444'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'
const missingRegistrationId = '6512a0c2f1e4b8a9d0c3e888'

// The accreditation from the read-model fixtures covers 2026.
const YEAR = 2026

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL',
  accreditationNumber: ACCREDITATION_NUMBER
}

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    reprocessor({
      id: registrationId,
      registrationNumber: numbers.registrationNumber,
      accreditationId
    }),
    reprocessor({
      id: unnumberedRegistrationId,
      registrationNumber: null
    })
  ],
  accreditations: [accreditation({ id: accreditationId })]
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
          year: YEAR,
          ...overrides
        })
      )
    ).id

  /** @param {string} id */
  const stored = (id) => reportsRepository.findReportById(id)

  const systemLogs = async () =>
    (await systemLogsRepository.find({ limit: 10 })).systemLogs

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
      unmappedReasons: {},
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
          next: {
            registrationNumber: numbers.registrationNumber,
            accreditationNumber: numbers.accreditationNumber
          }
        }
      })
    )
  })

  it('gives a quarterly report a null accreditation number', async () => {
    const id = await createReport({
      cadence: CADENCE.quarterly,
      period: 1
    })

    await run(false)

    expect(await stored(id)).toMatchObject({
      ...numbers,
      accreditationNumber: null
    })
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    const id = await createReport()

    expect(await run(true)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
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
    it('returns each report it cannot map under every reason that applies, logging none of them', async () => {
      const organisationGone = await createReport({
        organisationId: missingOrganisationId
      })
      const unnumbered = await createReport({
        registrationId: unnumberedRegistrationId,
        cadence: CADENCE.quarterly,
        period: 1
      })
      const registrationGone = await createReport({
        registrationId: missingRegistrationId
      })
      const unaccredited = await createReport({ year: YEAR - 1 })

      expect(await run(isDryRun)).toEqual({
        missing: 4,
        mapped: 3,
        unmapped: 4,
        unmappedReasons: {
          'organisation not found': [organisationGone],
          'no registration number': [unnumbered, registrationGone],
          'no accreditation number': [registrationGone, unaccredited]
        },
        failed: 0,
        auditFailed: 0
      })
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  it('still adds the numbers it can find to a report it cannot fully map', async () => {
    const id = await createReport({
      registrationId: unnumberedRegistrationId,
      cadence: CADENCE.quarterly,
      period: 1
    })

    await run(false)

    expect(await stored(id)).toMatchObject({
      organisationNumber: numbers.organisationNumber,
      accreditationNumber: null
    })
    expect(await stored(id)).not.toHaveProperty('registrationNumber')
  })

  it('does not report a number the report already holds as unmapped', async () => {
    const id = await createReport({ registrationId: unnumberedRegistrationId })
    await reportsRepository.assignNumbers(id, {
      accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER)
    })

    expect((await run(false)).unmappedReasons).toEqual({
      'no registration number': [id]
    })
  })

  it('leaves only the unmapped reports for the next run', async () => {
    await createReport({ period: MONTHLY_PERIODS.January })
    const organisationGone = await createReport({
      period: MONTHLY_PERIODS.February,
      organisationId: missingOrganisationId
    })
    await run(false)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 1,
      unmappedReasons: { 'organisation not found': [organisationGone] },
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
      unmappedReasons: {},
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
      unmappedReasons: {},
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
      unmappedReasons: {},
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: outage,
      message: `Failed to backfill numbers for report ${failing}`
    })
    expect(await stored(written)).toMatchObject(numbers)
  })

  it('counts an organisation whose accreditations cannot be read as a failure, not as unmapped', async () => {
    await createReport()
    organisationsRepository.findById = async () =>
      partialMock({ ...organisation, accreditations: undefined })

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 0,
      unmapped: 0,
      unmappedReasons: {},
      failed: 1,
      auditFailed: 0
    })
  })

  it('counts a written but unaudited report apart from failures', async () => {
    const id = await createReport()
    const auditError = new Error('system logs down')
    systemLogsRepository.insert = () => Promise.reject(auditError)

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      unmappedReasons: {},
      failed: 0,
      auditFailed: 1
    })
    expect(await stored(id)).toMatchObject(numbers)
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message: `Numbers written but audit failed for report ${id}: ${JSON.stringify(numbers)}`
    })
  })
})
