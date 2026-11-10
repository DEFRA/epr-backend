import { describe, it, expect, beforeEach, vi } from 'vitest'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  summaryLogFactory,
  withoutAccreditationId
} from '#repositories/summary-logs/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'
import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { backfillSummaryLogScope } from './backfill.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogStore } from '#repositories/summary-logs/inmemory.js' */
/** @import { StoredSummaryLog } from '#repositories/summary-logs/contract/test-data.js' */
/** @import { SummaryLogsRepository, SummaryLogVersion } from '#repositories/summary-logs/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const accreditationId = '6512a0c2f1e4b8a9d0c3e333'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    buildRegistration({
      id: registrationId,
      registrationNumber: 'R25SR500010912PL',
      accreditationId
    })
  ],
  accreditations: [
    buildAccreditation({
      id: accreditationId,
      accreditationNumber: toAccreditationNumber('ACC500123')
    })
  ]
})

const ids = { organisationId, registrationId }

/**
 * A summary log as stored before summary logs were scoped by accreditation
 * and year.
 *
 * @param {object} [overrides]
 */
const unscoped = (overrides = {}) => {
  const { year: _year, ...summaryLog } = withoutAccreditationId(
    summaryLogFactory.submitted({ ...ids, ...overrides })
  )
  return summaryLog
}

const uploadedFor = (/** @type {object} */ meta) => ({ meta })

const accreditedMeta = {
  PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT,
  ACCREDITATION_NUMBER: '  ACC500123'
}

const registeredOnlyMeta = {
  PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
}

describe('backfillSummaryLogScope', () => {
  /** @type {SummaryLogStore} */
  let storage
  /** @type {SystemLogsRepository} */
  let systemLogsRepository
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {TypedLogger} */
  let logger

  /** @param {Record<string, StoredSummaryLog>} summaryLogs */
  const store = (summaryLogs) => {
    for (const [id, summaryLog] of Object.entries(summaryLogs)) {
      // Holds what the store's type refuses, as the stored data does
      storage.set(
        toSummaryLogId(id),
        /** @type {SummaryLogVersion} */ (
          /** @type {unknown} */ ({ version: 1, summaryLog })
        )
      )
    }
  }

  beforeEach(() => {
    logger = createMockLogger()
    storage = new Map()
    systemLogsRepository = createMockSystemLogsRepository()
    organisationsRepository = createInMemoryOrganisationsRepository([
      /** @type {*} */ (organisation)
    ])()
  })

  const run = async (
    /** @type {boolean} */ isDryRun,
    /** @type {Partial<SummaryLogsRepository>} */ summaryLogsOverrides = {}
  ) => {
    const summaryLogsRepository = {
      ...createInMemorySummaryLogsRepository(storage)(logger),
      ...summaryLogsOverrides
    }
    return backfillSummaryLogScope(
      {
        summaryLogsRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )
  }

  const versionOf = (/** @type {string} */ id) => {
    const held = storage.get(toSummaryLogId(id))
    if (!held) {
      throw new Error(`Nothing stored under ${id}`)
    }
    return held
  }

  const stored = (/** @type {string} */ id) => versionOf(id).summaryLog

  const unmappedLines = () =>
    vi
      .mocked(logger.info)
      .mock.calls.map(([{ message }]) => message)
      .filter((message) =>
        message?.startsWith('Summary log accreditation unmapped')
      )

  it('records the accreditation whose number is stored with the summary log, and the year, auditing each as the system user', async () => {
    store({ accredited: unscoped(uploadedFor(accreditedMeta)) })

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      yearSet: 1,
      failed: 0,
      auditFailed: 0
    })

    expect(stored('accredited')).toMatchObject({
      accreditationId,
      accreditationNumber: 'ACC500123',
      year: 2026
    })
    expect(systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({ action: 'scope-backfill-migration' }),
        context: {
          summaryLogId: 'accredited',
          organisationId,
          registrationId,
          previous: { version: 1 },
          next: {
            accreditationId,
            accreditationNumber: 'ACC500123',
            year: 2026,
            version: 2
          }
        }
      })
    )
    expect(unmappedLines()).toEqual([])
  })

  it('records no accreditation for a registered-only processing type', async () => {
    store({ 'registered-only': unscoped(uploadedFor(registeredOnlyMeta)) })

    await run(false)

    expect(stored('registered-only')).toMatchObject({
      accreditationId: null,
      accreditationNumber: null,
      year: 2026
    })
  })

  it('records only the accreditation on a summary log that holds its year', async () => {
    store({
      'holds-year': withoutAccreditationId(
        summaryLogFactory.submitted({
          ...ids,
          year: 2027,
          ...uploadedFor(accreditedMeta)
        })
      )
    })

    await run(false)

    expect(stored('holds-year')).toMatchObject({
      accreditationNumber: 'ACC500123',
      year: 2027
    })
    expect(systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          next: {
            accreditationId,
            accreditationNumber: 'ACC500123',
            version: 2
          }
        })
      })
    )
  })

  it.each([
    [
      'an accreditation number its organisation does not hold',
      unscoped(
        uploadedFor({ ...accreditedMeta, ACCREDITATION_NUMBER: 'ACC999999' })
      ),
      `organisation ${organisationId} holds no accreditation ACC999999`
    ],
    [
      'an accreditation number stored as a number',
      unscoped(
        uploadedFor({ ...accreditedMeta, ACCREDITATION_NUMBER: 500123 })
      ),
      `organisation ${organisationId} holds no accreditation 500123`
    ],
    [
      'no accreditation number for an accredited processing type',
      unscoped(uploadedFor({ PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER })),
      'no accreditation number stored with the summary log'
    ],
    [
      'no processing type',
      unscoped(uploadedFor({})),
      'no accreditation number stored with the summary log'
    ],
    [
      'an organisation that has gone',
      unscoped({
        organisationId: missingOrganisationId,
        ...uploadedFor(accreditedMeta)
      }),
      `organisation ${missingOrganisationId} not found`
    ],
    [
      'no organisation id',
      unscoped({ ...uploadedFor(accreditedMeta), organisationId: undefined }),
      'organisation undefined not found'
    ]
  ])(
    'records only the year, and reports the accreditation unmapped, for %s',
    async (_description, summaryLog, reason) => {
      store({ unmapped: summaryLog })

      expect(await run(false)).toMatchObject({
        mapped: 0,
        unmapped: 1,
        yearSet: 1,
        failed: 0
      })

      expect(stored('unmapped').year).toBe(2026)
      expect(stored('unmapped')).not.toHaveProperty('accreditationNumber')
      expect(unmappedLines()).toEqual([
        expect.stringContaining(`summaryLogId=unmapped`)
      ])
      expect(unmappedLines()[0]).toContain(`reason="${reason}"`)
    }
  )

  it('leaves alone a summary log it can neither map nor give a year', async () => {
    store({
      'holds-year': withoutAccreditationId(
        summaryLogFactory.submitted({
          ...ids,
          ...uploadedFor({ PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER })
        })
      )
    })

    expect(await run(false)).toMatchObject({ mapped: 0, unmapped: 1 })

    expect(versionOf('holds-year').version).toBe(1)
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('reports what it would record without writing or auditing on a dry run', async () => {
    store({
      accredited: unscoped(uploadedFor(accreditedMeta)),
      gone: unscoped({ organisationId: missingOrganisationId })
    })

    expect(await run(true)).toEqual({
      missing: 2,
      mapped: 1,
      unmapped: 1,
      yearSet: 2,
      failed: 0,
      auditFailed: 0
    })

    expect(versionOf('accredited').version).toBe(1)
    expect(stored('accredited')).not.toHaveProperty('year')
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    expect(unmappedLines()).toHaveLength(1)
  })

  it('records only the year on a summary log that holds its accreditation', async () => {
    const { year: _year, ...holdsAccreditation } = summaryLogFactory.submitted({
      ...ids,
      accreditationId: null
    })
    store({ 'holds-accreditation': holdsAccreditation })

    await run(false)

    expect(stored('holds-accreditation')).toMatchObject({
      accreditationNumber: null,
      year: 2026
    })
  })

  it('counts as failed a summary log whose organisation cannot be read', async () => {
    store({ accredited: unscoped(uploadedFor(accreditedMeta)) })
    const error = new Error('database unavailable')
    organisationsRepository = partialMock({
      findById: vi.fn().mockRejectedValue(error)
    })

    expect(await run(false)).toMatchObject({ mapped: 0, failed: 1 })
    expect(stored('accredited')).not.toHaveProperty('year')
  })

  it('counts a failed write and carries on with the rest', async () => {
    store({
      first: unscoped(uploadedFor(accreditedMeta)),
      second: unscoped(uploadedFor(registeredOnlyMeta))
    })
    const error = new Error('write failed')
    const real = createInMemorySummaryLogsRepository(storage)(logger)
    const assignScope = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockImplementation(real.assignScope)

    expect(await run(false, { assignScope })).toMatchObject({
      mapped: 1,
      failed: 1
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to backfill the scope of summary log first'
    })
    expect(stored('second')).toMatchObject({ accreditationNumber: null })
  })

  it('counts a summary log written but not audited, logging what was written', async () => {
    store({ accredited: unscoped(uploadedFor(accreditedMeta)) })
    const error = new Error('audit failed')
    vi.mocked(systemLogsRepository.insert).mockRejectedValue(error)

    expect(await run(false)).toMatchObject({ mapped: 1, auditFailed: 1 })
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: `Scope written but audit failed for summary log accredited: {"accreditationId":"${accreditationId}","accreditationNumber":"ACC500123","year":2026}, version 1 -> 2`
    })
  })

  it('skips a summary log that has gone since it was listed', async () => {
    store({ gone: unscoped(uploadedFor(accreditedMeta)) })

    expect(
      await run(false, { findById: vi.fn().mockResolvedValue(null) })
    ).toMatchObject({ missing: 1, mapped: 0, failed: 0 })
  })
})
