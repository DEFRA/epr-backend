import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import {
  createMockOrganisationsRepository,
  createMockSystemLogsRepository
} from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'

import { backfillSummaryLogYear } from './backfill.js'

const legacy = () =>
  summaryLogFactory.validating({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    year: undefined,
    accreditationId: undefined
  })

describe('backfillSummaryLogYear', () => {
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
    organisationsRepository = createMockOrganisationsRepository({
      findRegistrationById: vi
        .fn()
        .mockResolvedValue({ validFrom: '2025-04-01' })
    })
  })

  const run = (isDryRun) =>
    backfillSummaryLogYear(
      {
        summaryLogsRepository,
        systemLogsRepository,
        organisationsRepository,
        logger
      },
      { isDryRun }
    )

  it('reports the derived years without writing or auditing on a dry run', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())

    expect(await run(true)).toEqual({
      legacy: 1,
      updated: 0,
      failed: 0,
      auditFailed: 0,
      years: { 2025: 1 }
    })

    expect((await summaryLogsRepository.findById('sl-1')).version).toBe(1)
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('assigns the registration start year and audits before and after as the system user', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())
    await summaryLogsRepository.insert('sl-2', summaryLogFactory.validating())

    expect(await run(false)).toEqual({
      legacy: 1,
      updated: 1,
      failed: 0,
      auditFailed: 0,
      years: { 2025: 1 }
    })
    expect(organisationsRepository.findRegistrationById).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )

    expect(systemLogsRepository.insert).toHaveBeenCalledTimes(1)
    expect(systemLogsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({ id: 'system' }),
        event: expect.objectContaining({ action: 'year-backfill-migration' }),
        context: {
          summaryLogId: 'sl-1',
          organisationId: 'org-1',
          registrationId: 'reg-1',
          previous: { year: undefined, version: 1 },
          next: { year: 2025, version: 2 }
        }
      })
    )
  })

  it('is a no-op on a second run', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())
    await run(false)
    systemLogsRepository.insert.mockClear()

    await new Promise((resolve) => setImmediate(resolve))
    expect(await run(false)).toEqual({
      legacy: 0,
      updated: 0,
      failed: 0,
      auditFailed: 0,
      years: {}
    })
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('logs a conflict, counts it as failed and carries on', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())
    await summaryLogsRepository.insert('sl-2', legacy())
    const assignYear = summaryLogsRepository.assignYear
    summaryLogsRepository.assignYear = vi
      .fn()
      .mockRejectedValueOnce(new Error('Version conflict'))
      .mockImplementation(assignYear)

    expect(await run(false)).toEqual({
      legacy: 2,
      updated: 1,
      failed: 1,
      auditFailed: 0,
      years: { 2025: 1 }
    })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Failed to backfill year')
      })
    )
  })

  it('skips a summary log that is gone or got a year after it was listed', async () => {
    await summaryLogsRepository.insert(
      'sl-scoped',
      summaryLogFactory.validating()
    )
    summaryLogsRepository.findIdsWithoutYear = vi
      .fn()
      .mockResolvedValue(['sl-scoped', 'sl-missing'])

    expect(await run(false)).toEqual({
      legacy: 2,
      updated: 0,
      failed: 0,
      auditFailed: 0,
      years: {}
    })
    expect(systemLogsRepository.insert).not.toHaveBeenCalled()
  })

  it('uses the earliest approval in the status history when the registration has no validFrom', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())
    organisationsRepository.findRegistrationById.mockResolvedValue({
      statusHistory: [
        { status: 'created', updatedAt: '2024-11-01' },
        { status: 'approved', updatedAt: '2026-01-02' },
        { status: 'approved', updatedAt: '2025-02-10' },
        { status: 'cancelled', updatedAt: '2026-03-05' }
      ]
    })

    expect(await run(false)).toEqual({
      legacy: 1,
      updated: 1,
      failed: 0,
      auditFailed: 0,
      years: { 2025: 1 }
    })
  })

  it.each([
    ['no status history', {}],
    [
      'no approval in its status history',
      { statusHistory: [{ status: 'created', updatedAt: '2025-01-01' }] }
    ]
  ])(
    'fails a summary log whose registration has no validFrom and %s, leaving it unchanged',
    async (_name, registration) => {
      await summaryLogsRepository.insert('sl-1', legacy())
      organisationsRepository.findRegistrationById.mockResolvedValue(
        registration
      )

      expect(await run(false)).toEqual({
        legacy: 1,
        updated: 0,
        failed: 1,
        auditFailed: 0,
        years: {}
      })
      expect((await summaryLogsRepository.findById('sl-1')).version).toBe(1)
      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
    }
  )

  it('fails a summary log with no registration reference', async () => {
    await summaryLogsRepository.insert(
      'sl-1',
      summaryLogFactory.validating({
        organisationId: undefined,
        registrationId: undefined,
        year: undefined
      })
    )

    expect(await run(false)).toMatchObject({ updated: 0, failed: 1 })
    expect(organisationsRepository.findRegistrationById).not.toHaveBeenCalled()
  })

  it('keeps the written year and counts an audit failure apart from a write failure', async () => {
    await summaryLogsRepository.insert('sl-1', legacy())
    systemLogsRepository.insert.mockRejectedValue(new Error('audit down'))

    expect(await run(false)).toEqual({
      legacy: 1,
      updated: 1,
      failed: 0,
      auditFailed: 1,
      years: { 2025: 1 }
    })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Year written but audit failed for summary log sl-1'
        )
      })
    )
  })
})
