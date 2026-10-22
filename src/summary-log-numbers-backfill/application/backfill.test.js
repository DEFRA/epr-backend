import { describe, it, expect, vi, beforeEach } from 'vitest'
import Boom from '@hapi/boom'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  summaryLogFactory,
  withoutYear
} from '#repositories/summary-logs/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { createMockSystemLogsRepository } from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'

import { backfillSummaryLogNumbers } from './backfill.js'

const { buildOrganisation } = createOrganisationBuilders()

const organisationId = '6512a0c2f1e4b8a9d0c3e111'
const registrationId = '6512a0c2f1e4b8a9d0c3e222'
const accreditationId = '6512a0c2f1e4b8a9d0c3e333'
const unnumberedRegistrationId = '6512a0c2f1e4b8a9d0c3e444'
const missingOrganisationId = '6512a0c2f1e4b8a9d0c3e999'

const organisation = buildOrganisation({
  id: organisationId,
  orgId: 500123,
  registrations: [
    buildRegistration({
      id: registrationId,
      registrationNumber: 'R25SR500010912PL',
      accreditationId
    }),
    buildRegistration({
      id: unnumberedRegistrationId,
      registrationNumber: null,
      accreditationId: undefined
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

describe('backfillSummaryLogNumbers', () => {
  /** @type {*} */
  let summaryLogsRepository
  /** @type {*} */
  let systemLogsRepository
  /** @type {*} */
  let organisationsRepository
  /** @type {*} */
  let logger

  beforeEach(() => {
    logger = createMockLogger()
    summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
    systemLogsRepository = createMockSystemLogsRepository()
    organisationsRepository = createInMemoryOrganisationsRepository([
      /** @type {*} */ (organisation)
    ])()
  })

  const run = (isDryRun) =>
    backfillSummaryLogNumbers(
      {
        summaryLogsRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )

  const stored = async (id) =>
    (await summaryLogsRepository.findById(id)).summaryLog

  const settle = () => new Promise((resolve) => setImmediate(resolve))

  const unmappedLines = () =>
    logger.info.mock.calls
      .map(([{ message }]) => message)
      .filter((message) => message.startsWith('Summary log numbers unmapped'))

  it('adds the numbers each summary log lacks and audits each as the system user', async () => {
    await summaryLogsRepository.insert(
      'accredited',
      summaryLogFactory.validated({ ...ids, accreditationId })
    )
    await summaryLogsRepository.insert(
      'registered-only',
      summaryLogFactory.validated({ ...ids, accreditationId: null })
    )
    await summaryLogsRepository.insert(
      'before-accreditation',
      withoutYear(summaryLogFactory.validated(ids))
    )
    await summaryLogsRepository.insert(
      'partly-numbered',
      summaryLogFactory.validated({
        ...ids,
        accreditationId: null,
        organisationNumber: '500123'
      })
    )

    expect(await run(false)).toEqual({
      missing: 4,
      inFlight: 0,
      mapped: 4,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })
    await settle()

    expect(await stored('accredited')).toMatchObject({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: 'ACC500123'
    })
    expect(await stored('registered-only')).toMatchObject({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL',
      accreditationNumber: null
    })
    const beforeAccreditation = await stored('before-accreditation')
    expect(beforeAccreditation).toMatchObject({
      organisationNumber: '500123',
      registrationNumber: 'R25SR500010912PL'
    })
    expect(beforeAccreditation).not.toHaveProperty('accreditationNumber')

    expect(systemLogsRepository.insert).toHaveBeenCalledTimes(4)
    expect(systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({
          action: 'numbers-backfill-migration'
        }),
        context: {
          summaryLogId: 'partly-numbered',
          organisationId,
          registrationId,
          accreditationId: null,
          previous: { version: 1 },
          next: {
            registrationNumber: 'R25SR500010912PL',
            accreditationNumber: null,
            version: 2
          }
        }
      })
    )
    expect(unmappedLines()).toEqual([])
  })

  it('reports what it would add without writing or auditing on a dry run', async () => {
    await summaryLogsRepository.insert(
      'accredited',
      summaryLogFactory.validated({ ...ids, accreditationId })
    )

    expect(await run(true)).toEqual({
      missing: 1,
      inFlight: 0,
      mapped: 1,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })

    expect((await summaryLogsRepository.findById('accredited')).version).toBe(1)
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('leaves alone a summary log that a worker may be writing, and counts it', async () => {
    for (const status of ['preprocessing', 'validating', 'submitting']) {
      await summaryLogsRepository.insert(
        status,
        summaryLogFactory[status]({ ...ids, accreditationId })
      )
    }

    expect(await run(false)).toEqual({
      missing: 3,
      inFlight: 3,
      mapped: 0,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })

    for (const status of ['preprocessing', 'validating', 'submitting']) {
      const { version, summaryLog } =
        await summaryLogsRepository.findById(status)
      expect(version).toBe(1)
      expect(summaryLog).not.toHaveProperty('organisationNumber')
    }
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  describe.each([
    ['a backfill', false],
    ['a dry run', true]
  ])('on %s', (_, isDryRun) => {
    it('logs one line for each summary log it cannot map, saying why', async () => {
      await summaryLogsRepository.insert(
        'no-ids',
        summaryLogFactory.validated()
      )
      await summaryLogsRepository.insert(
        'organisation-gone',
        summaryLogFactory.validated({
          organisationId: missingOrganisationId,
          registrationId
        })
      )
      await summaryLogsRepository.insert(
        'unnumbered',
        summaryLogFactory.validated({
          organisationId,
          registrationId: unnumberedRegistrationId,
          accreditationId: 'acc-gone'
        })
      )

      expect(await run(isDryRun)).toEqual({
        missing: 3,
        inFlight: 0,
        mapped: 1,
        unmapped: 3,
        failed: 0,
        auditFailed: 0
      })

      expect(unmappedLines()).toEqual([
        'Summary log numbers unmapped: summaryLogId=no-ids status=validated organisationId=undefined registrationId=undefined accreditationId=null reasons="summary log holds no organisation or registration id"',
        `Summary log numbers unmapped: summaryLogId=organisation-gone status=validated organisationId=${missingOrganisationId} registrationId=${registrationId} accreditationId=null reasons="organisation ${missingOrganisationId} not found"`,
        `Summary log numbers unmapped: summaryLogId=unnumbered status=validated organisationId=${organisationId} registrationId=${unnumberedRegistrationId} accreditationId=acc-gone reasons="registration ${unnumberedRegistrationId} has no registration number; organisation ${organisationId} holds no accreditation acc-gone"`
      ])
    })
  })

  it('still adds the numbers it can find to a summary log it cannot fully map', async () => {
    await summaryLogsRepository.insert(
      'unnumbered',
      summaryLogFactory.validated({
        organisationId,
        registrationId: unnumberedRegistrationId
      })
    )

    await run(false)
    await settle()

    expect(await stored('unnumbered')).toMatchObject({
      organisationNumber: '500123',
      accreditationNumber: null
    })
    expect(await stored('unnumbered')).not.toHaveProperty('registrationNumber')
  })

  it('leaves only the unmapped summary logs for the next run', async () => {
    await summaryLogsRepository.insert(
      'accredited',
      summaryLogFactory.validated({ ...ids, accreditationId })
    )
    await summaryLogsRepository.insert('no-ids', summaryLogFactory.validated())
    await run(false)
    await settle()
    systemLogsRepository.insert.mockClear()

    expect(await run(false)).toEqual({
      missing: 1,
      inFlight: 0,
      mapped: 0,
      unmapped: 1,
      failed: 0,
      auditFailed: 0
    })
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('skips a summary log that has gone since it was listed', async () => {
    summaryLogsRepository.findIdsWithoutNumbers = vi
      .fn()
      .mockResolvedValue(['gone'])

    expect(await run(false)).toEqual({
      missing: 1,
      inFlight: 0,
      mapped: 0,
      unmapped: 0,
      failed: 0,
      auditFailed: 0
    })
  })

  it('logs a failed write, counts it and carries on', async () => {
    await summaryLogsRepository.insert(
      'conflicted',
      summaryLogFactory.validated(ids)
    )
    await summaryLogsRepository.insert(
      'written',
      summaryLogFactory.validated(ids)
    )
    const conflict = Boom.conflict('Version conflict')
    const assignNumbers = summaryLogsRepository.assignNumbers
    summaryLogsRepository.assignNumbers = vi.fn((id, ...rest) =>
      id === 'conflicted'
        ? Promise.reject(conflict)
        : assignNumbers(id, ...rest)
    )

    expect(await run(false)).toEqual({
      missing: 2,
      inFlight: 0,
      mapped: 1,
      unmapped: 0,
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: conflict,
      message: 'Failed to backfill numbers for summary log conflicted'
    })
  })

  it('counts a failed organisation lookup as a failure, not as unmapped', async () => {
    await summaryLogsRepository.insert(
      'lookup-fails',
      summaryLogFactory.validated(ids)
    )
    const outage = new Error('connection lost')
    organisationsRepository.findById = vi.fn().mockRejectedValue(outage)

    expect(await run(false)).toEqual({
      missing: 1,
      inFlight: 0,
      mapped: 0,
      unmapped: 0,
      failed: 1,
      auditFailed: 0
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: outage,
      message: 'Failed to backfill numbers for summary log lookup-fails'
    })
  })

  it('counts a written but unaudited summary log apart from failures', async () => {
    await summaryLogsRepository.insert(
      'unaudited',
      summaryLogFactory.validated(ids)
    )
    const auditError = new Error('system logs down')
    systemLogsRepository.insert.mockRejectedValue(auditError)

    expect(await run(false)).toEqual({
      missing: 1,
      inFlight: 0,
      mapped: 1,
      unmapped: 0,
      failed: 0,
      auditFailed: 1
    })
    expect(logger.error).toHaveBeenCalledWith({
      err: auditError,
      message:
        'Numbers written but audit failed for summary log unaudited: {"organisationNumber":"500123","registrationNumber":"R25SR500010912PL","accreditationNumber":null}, version 1 -> 2'
    })
  })
})
