import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  accreditation,
  exporterAccreditation,
  granted,
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
const relinkedAccreditationId = '6512a0c2f1e4b8a9d0c3e555'
const unnumberedAccreditationId = '6512a0c2f1e4b8a9d0c3e666'
const missingAccreditationId = '6512a0c2f1e4b8a9d0c3e777'
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

/** @param {object} [overrides] */
const matchingAccreditation = (overrides = {}) =>
  accreditation({ reprocessingType: 'input', ...overrides })

const otherSite = {
  address: { line1: '9 Other processing site', postcode: 'LS1 1AA' }
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
  accreditations: [
    matchingAccreditation({ id: accreditationId }),
    matchingAccreditation({
      id: unnumberedAccreditationId,
      accreditationNumber: null
    })
  ]
})

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

describe('backfillReportNumbers', () => {
  /** @type {ReportsRepository} */
  let reportsRepository
  /** @type {SystemLogsRepository} */
  let systemLogsRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {SummaryLogsRepository} */
  let summaryLogsRepository
  /** @type {TypedLogger} */
  let logger

  /**
   * @param {string} summaryLogId
   * @param {string | null | undefined} submittedForAccreditationId
   */
  const submitSummaryLog = (summaryLogId, submittedForAccreditationId) =>
    summaryLogsRepository.insert(
      summaryLogId,
      summaryLogFactory.submitted({
        organisationId,
        registrationId,
        year: YEAR,
        accreditationId: submittedForAccreditationId
      })
    )

  /** @param {object} changes */
  const changeOrganisation = (changes) => {
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock({ ...organisation, ...changes })
    ])()
  }

  beforeEach(async () => {
    logger = createMockLogger()
    reportsRepository = createInMemoryReportsRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    organisationsRepository = createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
    await submitSummaryLog('sl-1', accreditationId)
  })

  /** @param {boolean} isDryRun */
  const run = (isDryRun) =>
    backfillReportNumbers(
      {
        reportsRepository,
        systemLogsRepository,
        organisationsRepository,
        summaryLogsRepository,
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
      auditFailed: 0,
      cases: { 'summary log accreditation is the current link': 2 },
      cancelledAccreditations: 0
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
      auditFailed: 0,
      cases: { 'summary log accreditation is the current link': 1 },
      cancelledAccreditations: 0
    })

    expect(await stored(id)).not.toHaveProperty('organisationNumber')
    expect(await systemLogs()).toEqual([])
  })

  describe.each([
    ['a backfill', false],
    ['a dry run', true]
  ])('on %s', (_, isDryRun) => {
    it('returns each report it cannot map under the reason that applies, logging none of them', async () => {
      await submitSummaryLog('sl-unnumbered', unnumberedAccreditationId)
      await submitSummaryLog('sl-gone', missingAccreditationId)
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
      const noSummaryLog = await createReport({
        period: MONTHLY_PERIODS.February,
        source: { summaryLogId: null, lastUploadedAt: null }
      })
      const unnumberedAccreditation = await createReport({
        period: MONTHLY_PERIODS.March,
        source: { summaryLogId: 'sl-unnumbered', lastUploadedAt: null }
      })
      const accreditationGone = await createReport({
        period: MONTHLY_PERIODS.April,
        source: { summaryLogId: 'sl-gone', lastUploadedAt: null }
      })

      expect(await run(isDryRun)).toEqual({
        missing: 6,
        mapped: 5,
        unmapped: 6,
        unmappedReasons: {
          'organisation not found': [organisationGone],
          'no registration number': [unnumbered],
          'registration not found': [registrationGone],
          'report names no summary log': [noSummaryLog],
          'no accreditation number': [unnumberedAccreditation],
          'accreditation not found': [accreditationGone]
        },
        failed: 0,
        auditFailed: 0,
        cases: {
          'organisation not found': 1,
          quarterly: 1,
          'registration not found': 1,
          'report names no summary log, several accreditations matching its registration': 1,
          'summary log accreditation differs from the current link': 1,
          'accreditation not found': 1
        },
        cancelledAccreditations: 0
      })
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('gives a monthly report the number of the accreditation its summary log was submitted for', () => {
    it('keeps the earlier accreditation after its registration is re-linked to another in the same year', async () => {
      changeOrganisation({
        registrations: [
          reprocessor({
            id: registrationId,
            registrationNumber: numbers.registrationNumber,
            accreditationId: relinkedAccreditationId
          })
        ],
        accreditations: [
          accreditation({ id: accreditationId }),
          accreditation({
            id: relinkedAccreditationId,
            accreditationNumber: toAccreditationNumber('A26ER5009999999PL')
          })
        ]
      })
      const id = await createReport()

      await run(false)

      expect(await stored(id)).toMatchObject(numbers)
    })

    it('maps a report after its registration is re-linked to an accreditation for a later year', async () => {
      changeOrganisation({
        registrations: [
          reprocessor({
            id: registrationId,
            registrationNumber: numbers.registrationNumber,
            accreditationId: relinkedAccreditationId
          })
        ],
        accreditations: [
          accreditation({ id: accreditationId }),
          accreditation({
            id: relinkedAccreditationId,
            accreditationNumber: toAccreditationNumber('A27ER5009999999PL'),
            validFrom: '2027-01-01',
            validTo: '2027-12-31'
          })
        ]
      })
      const id = await createReport()

      expect((await run(false)).unmapped).toBe(0)
      expect(await stored(id)).toMatchObject(numbers)
    })

    it.each([
      [
        'set back to created',
        {
          statusHistory: [
            { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' }
          ]
        }
      ],
      ['without a validFrom', { validFrom: undefined }],
      ['cancelled', { statusHistory: granted('cancelled') }]
    ])(
      'maps a report whose accreditation is now %s but still holds its number',
      async (_, changes) => {
        changeOrganisation({
          accreditations: [accreditation({ id: accreditationId, ...changes })]
        })
        const id = await createReport()

        expect((await run(false)).unmapped).toBe(0)
        expect(await stored(id)).toMatchObject(numbers)
      }
    )

    it.each([
      [
        'report names no summary log',
        { summaryLogId: null, lastUploadedAt: null }
      ],
      [
        'summary log not found',
        { summaryLogId: 'sl-deleted', lastUploadedAt: null }
      ],
      [
        'summary log names no accreditation',
        { summaryLogId: 'sl-registered-only', lastUploadedAt: null }
      ],
      [
        'summary log predates accreditation ids',
        { summaryLogId: 'sl-legacy', lastUploadedAt: null }
      ]
    ])(
      'leaves a monthly report without an accreditation number as "%s"',
      async (reason, source) => {
        await submitSummaryLog('sl-registered-only', null)
        await submitSummaryLog('sl-legacy', undefined)
        const id = await createReport({ source })

        expect((await run(false)).unmappedReasons).toEqual({
          [reason]: [id]
        })
      }
    )
  })

  describe('counts each report it meets under its mapping case', () => {
    const noSummaryLog = { summaryLogId: null, lastUploadedAt: null }

    describe.each([
      ['report names no summary log', noSummaryLog],
      [
        'summary log predates accreditation ids',
        { summaryLogId: 'sl-legacy', lastUploadedAt: null }
      ]
    ])('where the %s', (reason, source) => {
      it.each([
        ['no accreditation', []],
        [
          'one accreditation',
          [
            matchingAccreditation({ id: accreditationId }),
            matchingAccreditation({
              id: relinkedAccreditationId,
              site: otherSite
            }),
            exporterAccreditation({ id: missingAccreditationId })
          ]
        ],
        [
          'several accreditations',
          [
            matchingAccreditation({ id: accreditationId }),
            matchingAccreditation({ id: relinkedAccreditationId })
          ]
        ]
      ])(
        'counts a report whose organisation holds %s matching its registration',
        async (held, accreditations) => {
          changeOrganisation({ accreditations })
          await submitSummaryLog('sl-legacy', undefined)
          await createReport({ source })

          expect(await run(true)).toMatchObject({
            cases: { [`${reason}, ${held} matching its registration`]: 1 },
            cancelledAccreditations: 0
          })
        }
      )
    })

    it('counts a report whose summary log accreditation is now cancelled', async () => {
      changeOrganisation({
        accreditations: [
          accreditation({
            id: accreditationId,
            statusHistory: granted('cancelled')
          })
        ]
      })
      await createReport()

      expect(await run(true)).toMatchObject({
        cases: { 'summary log accreditation is the current link': 1 },
        cancelledAccreditations: 1
      })
    })

    it('counts a report with no summary log whose organisation holds a cancelled accreditation matching its registration', async () => {
      changeOrganisation({
        accreditations: [
          matchingAccreditation({ id: accreditationId }),
          matchingAccreditation({
            id: relinkedAccreditationId,
            statusHistory: granted('cancelled')
          })
        ]
      })
      await createReport({ source: noSummaryLog })

      expect(await run(true)).toMatchObject({
        cases: {
          'report names no summary log, several accreditations matching its registration': 1
        },
        cancelledAccreditations: 1
      })
    })

    it('counts a cancelled summary log accreditation for a report whose registration the organisation no longer holds', async () => {
      changeOrganisation({
        accreditations: [
          matchingAccreditation({
            id: accreditationId,
            statusHistory: granted('cancelled')
          })
        ]
      })
      await createReport({ registrationId: missingRegistrationId })

      expect(await run(true)).toMatchObject({
        cases: { 'registration not found': 1 },
        cancelledAccreditations: 1
      })
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

  it('gives the accreditation number to a monthly report whose registration the organisation no longer holds', async () => {
    const id = await createReport({ registrationId: missingRegistrationId })

    await run(false)

    expect(await stored(id)).toMatchObject({
      organisationNumber: numbers.organisationNumber,
      accreditationNumber: numbers.accreditationNumber
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
      auditFailed: 0,
      cases: { 'organisation not found': 1 },
      cancelledAccreditations: 0
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
      auditFailed: 0,
      cases: {},
      cancelledAccreditations: 0
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
      auditFailed: 0,
      cases: {},
      cancelledAccreditations: 0
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
      auditFailed: 0,
      cases: { 'summary log accreditation is the current link': 1 },
      cancelledAccreditations: 0
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
      auditFailed: 0,
      cases: {},
      cancelledAccreditations: 0
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
      auditFailed: 1,
      cases: { 'summary log accreditation is the current link': 1 },
      cancelledAccreditations: 0
    })
    expect(await stored(id)).toMatchObject(numbers)
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message: `Numbers written but audit failed for report ${id}: ${JSON.stringify(numbers)}`
    })
  })
})
