import { MongoClient } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { COLLECTION_NAME } from '#repositories/summary-logs/mongodb.js'
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
import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'

import { createUnscopedSummaryLogs } from '../mongodb.js'
import { backfillSummaryLogScope } from './backfill.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { UnscopedSummaryLogs } from '../mongodb.js' */

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

const withoutOrganisationId = (/** @type {object} */ summaryLog) => {
  const { organisationId: _, ...rest } =
    /** @type {{ organisationId?: unknown }} */ (summaryLog)
  return rest
}

const uploadedFor = (/** @type {object} */ meta) => ({ meta })

const accreditedMeta = {
  PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT,
  ACCREDITATION_NUMBER: '  ACC500123'
}

const registeredOnlyMeta = {
  PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
}

/**
 * @typedef {Object} Backfill
 * @property {UnscopedSummaryLogs} summaryLogs
 * @property {(summaryLogs: Record<string, object>) => Promise<void>} store
 * @property {(id: string) => Promise<any>} stored
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {TypedLogger} logger
 * @property {() => string[]} unmappedLines
 * @property {(isDryRun: boolean, overrides?: { summaryLogs?: Partial<UnscopedSummaryLogs>, organisationAdministrationRepository?: OrganisationsRepository }) => ReturnType<typeof backfillSummaryLogScope>} run
 */

const it = /** @type {import('vitest').TestAPI<{ backfill: Backfill }>} */ (
  mongoIt.extend({
    backfill: async (/** @type {*} */ { db }, use) => {
      const client = await MongoClient.connect(db)
      const database = client.db('epr-backend')
      /** @type {import('mongodb').Collection<any>} */
      const collection = database.collection(COLLECTION_NAME)
      await collection.deleteMany({})

      const summaryLogs = createUnscopedSummaryLogs(database)
      const logger = createMockLogger()
      const systemLogsRepository = createMockSystemLogsRepository()
      const organisationAdministrationRepository =
        createInMemoryOrganisationsRepository([
          /** @type {*} */ (organisation)
        ])()

      /** @type {Backfill} */
      const backfill = {
        summaryLogs,
        store: async (stored) => {
          await collection.insertMany(
            Object.entries(stored).map(([id, summaryLog]) => ({
              _id: id,
              version: 1,
              ...summaryLog
            }))
          )
        },
        stored: async (id) => {
          const held = await collection.findOne({ _id: id })
          if (!held) {
            throw new Error(`Nothing stored under ${id}`)
          }
          return held
        },
        systemLogsRepository,
        logger,
        unmappedLines: () =>
          vi
            .mocked(logger.info)
            .mock.calls.flatMap(([{ message }]) =>
              message?.startsWith('Summary log accreditation unmapped')
                ? [message]
                : []
            ),
        run: (isDryRun, overrides = {}) =>
          backfillSummaryLogScope(
            {
              summaryLogs: { ...summaryLogs, ...overrides.summaryLogs },
              systemLogsRepository,
              organisationAdministrationRepository:
                overrides.organisationAdministrationRepository ??
                organisationAdministrationRepository,
              logger
            },
            { isDryRun }
          )
      }

      await use(backfill)
      await client.close()
    }
  })
)

describe('backfillSummaryLogScope (mongo)', () => {
  it('records the accreditation whose number is stored with the summary log, and the year, auditing each as the system user', async ({
    backfill: { store, run, stored, systemLogsRepository, unmappedLines }
  }) => {
    await store({ accredited: unscoped(uploadedFor(accreditedMeta)) })

    expect(await run(false)).toEqual({
      missing: 1,
      mapped: 1,
      unmapped: 0,
      yearSet: 1,
      failed: 0,
      auditFailed: 0
    })

    expect(await stored('accredited')).toMatchObject({
      accreditationId,
      accreditationNumber: 'ACC500123',
      year: 2026,
      version: 2
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

  it('records no accreditation for a registered-only processing type', async ({
    backfill: { store, run, stored }
  }) => {
    await store({
      'registered-only': unscoped(uploadedFor(registeredOnlyMeta))
    })

    await run(false)

    expect(await stored('registered-only')).toMatchObject({
      accreditationId: null,
      accreditationNumber: null,
      year: 2026
    })
  })

  it('records only the accreditation on a summary log that holds its year', async ({
    backfill: { store, run, stored, systemLogsRepository }
  }) => {
    await store({
      'holds-year': withoutAccreditationId(
        summaryLogFactory.submitted({
          ...ids,
          year: 2027,
          ...uploadedFor(accreditedMeta)
        })
      )
    })

    await run(false)

    expect(await stored('holds-year')).toMatchObject({
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

  it.for(
    /** @type {[string, object, string][]} */ ([
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
        withoutOrganisationId(unscoped(uploadedFor(accreditedMeta))),
        'organisation undefined not found'
      ]
    ])
  )(
    'records only the year, and reports the accreditation unmapped, for %s',
    async (
      [_description, summaryLog, reason],
      { backfill: { store, run, stored, unmappedLines } }
    ) => {
      await store({ unmapped: summaryLog })

      expect(await run(false)).toMatchObject({
        mapped: 0,
        unmapped: 1,
        yearSet: 1,
        failed: 0
      })

      const written = await stored('unmapped')
      expect(written.year).toBe(2026)
      expect(written).not.toHaveProperty('accreditationNumber')
      expect(unmappedLines()).toEqual([
        expect.stringContaining(`summaryLogId=unmapped`)
      ])
      expect(unmappedLines()[0]).toContain(`reason="${reason}"`)
    }
  )

  it('leaves alone a summary log it can neither map nor give a year', async ({
    backfill: { store, run, stored, systemLogsRepository }
  }) => {
    await store({
      'holds-year': withoutAccreditationId(
        summaryLogFactory.submitted({
          ...ids,
          ...uploadedFor({ PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER })
        })
      )
    })

    expect(await run(false)).toMatchObject({ mapped: 0, unmapped: 1 })

    expect((await stored('holds-year')).version).toBe(1)
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('reports what it would record without writing or auditing on a dry run', async ({
    backfill: { store, run, stored, systemLogsRepository, unmappedLines }
  }) => {
    await store({
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

    const accredited = await stored('accredited')
    expect(accredited.version).toBe(1)
    expect(accredited).not.toHaveProperty('year')
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    expect(unmappedLines()).toHaveLength(1)
  })

  it('records only the year on a summary log that holds its accreditation', async ({
    backfill: { store, run, stored }
  }) => {
    const { year: _year, ...holdsAccreditation } = summaryLogFactory.submitted({
      ...ids,
      accreditationId: null
    })
    await store({ 'holds-accreditation': holdsAccreditation })

    await run(false)

    expect(await stored('holds-accreditation')).toMatchObject({
      accreditationNumber: null,
      year: 2026
    })
  })

  it('counts as failed a summary log whose organisation cannot be read', async ({
    backfill: { store, run, stored }
  }) => {
    await store({ accredited: unscoped(uploadedFor(accreditedMeta)) })
    const organisationAdministrationRepository = partialMock({
      findById: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })

    expect(
      await run(false, { organisationAdministrationRepository })
    ).toMatchObject({
      mapped: 0,
      failed: 1
    })
    expect(await stored('accredited')).not.toHaveProperty('year')
  })

  it('counts as failed a summary log that changed after it was read, and carries on with the rest', async ({
    backfill: { summaryLogs, store, run, stored, logger }
  }) => {
    await store({
      first: unscoped(uploadedFor(accreditedMeta)),
      second: unscoped(uploadedFor(registeredOnlyMeta))
    })
    const readBeforeAChange = async (/** @type {*} */ id) => {
      const read = await summaryLogs.findById(id)
      return id === 'first' && read ? { ...read, version: 0 } : read
    }

    expect(
      await run(false, { summaryLogs: { findById: readBeforeAChange } })
    ).toMatchObject({ mapped: 1, failed: 1 })
    expect(logger.error).toHaveBeenCalledWith({
      err: expect.objectContaining({
        message:
          'Summary log first is no longer at version 0 without accreditationId, accreditationNumber, year'
      }),
      message: 'Failed to backfill the scope of summary log first'
    })
    expect(await stored('first')).not.toHaveProperty('year')
    expect(await stored('second')).toMatchObject({ accreditationNumber: null })
  })

  it('counts a summary log written but not audited, logging what was written', async ({
    backfill: { store, run, systemLogsRepository, logger }
  }) => {
    await store({ accredited: unscoped(uploadedFor(accreditedMeta)) })
    const error = new Error('audit failed')
    vi.mocked(systemLogsRepository.insert).mockRejectedValue(error)

    expect(await run(false)).toMatchObject({ mapped: 1, auditFailed: 1 })
    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: `Scope written but audit failed for summary log accredited: {"accreditationId":"${accreditationId}","accreditationNumber":"ACC500123","year":2026}, version 1 -> 2`
    })
  })

  it('skips a summary log that has gone since it was listed', async ({
    backfill: { run }
  }) => {
    const listedThenRemoved = async () => [/** @type {*} */ ('gone')]

    expect(
      await run(false, {
        summaryLogs: { findIdsWithoutScope: listedThenRemoved }
      })
    ).toMatchObject({ missing: 1, mapped: 0, failed: 0 })
  })
})
