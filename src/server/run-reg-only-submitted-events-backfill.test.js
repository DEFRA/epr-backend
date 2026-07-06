import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { backfillRegisteredOnlySubmittedEvents } from '#waste-records/application/backfill-registered-only-submitted-events.js'

import { runRegOnlySubmittedEventsBackfill } from './run-reg-only-submitted-events-backfill.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock(
  '#waste-records/application/backfill-registered-only-submitted-events.js',
  () => ({
    backfillRegisteredOnlySubmittedEvents: vi.fn()
  })
)

/**
 * @param {Partial<import('#waste-records/application/backfill-registered-only-submitted-events.js').RegisteredOnlySweepSummary>} [summary]
 */
const seedSummary = (summary = {}) => {
  vi.mocked(backfillRegisteredOnlySubmittedEvents).mockResolvedValue({
    organisationsScanned: 0,
    registrationsScanned: 0,
    submissionsScanned: 0,
    submittedEventWrites: 0,
    registeredOnlyPlan: [],
    ...summary
  })
}

describe('runRegOnlySubmittedEventsBackfill', () => {
  let mockServer
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()
    seedSummary()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      featureFlags: {
        isRegisteredOnlySubmittedEventsEnabled: () => false
      },
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      },
      app: {
        organisationsRepository: { name: 'organisations' },
        wasteRecordsRepository: { name: 'wasteRecords' },
        summaryLogsRepository: { name: 'summaryLogs' },
        overseasSitesRepository: { name: 'overseasSites' },
        systemLogsRepository: { name: 'systemLogs' },
        ledgerRepository: { name: 'ledger' },
        wasteBalanceService: { name: 'wasteBalanceService' }
      }
    }
  })

  it('runs read-only in dry-run when the flag is off, still taking the lock', async () => {
    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'registered-only-submitted-events-backfill'
    )
    expect(backfillRegisteredOnlySubmittedEvents).toHaveBeenCalledWith(
      expect.objectContaining({ writeSubmittedEvents: false })
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('executes when the flag is on', async () => {
    mockServer.featureFlags.isRegisteredOnlySubmittedEventsEnabled = () => true

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(backfillRegisteredOnlySubmittedEvents).toHaveBeenCalledWith(
      expect.objectContaining({ writeSubmittedEvents: true })
    )
  })

  it('wires the sweep to the registered adapters', async () => {
    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(backfillRegisteredOnlySubmittedEvents).toHaveBeenCalledWith({
      organisationsRepository: mockServer.app.organisationsRepository,
      wasteRecordsRepository: mockServer.app.wasteRecordsRepository,
      summaryLogsRepository: mockServer.app.summaryLogsRepository,
      overseasSitesRepository: mockServer.app.overseasSitesRepository,
      systemLogsRepository: mockServer.app.systemLogsRepository,
      ledgerRepository: mockServer.app.ledgerRepository,
      wasteBalanceService: mockServer.app.wasteBalanceService,
      writeSubmittedEvents: false
    })
  })

  it('skips the backfill when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(backfillRegisteredOnlySubmittedEvents).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping registered-only submitted-events backfill'
    })
  })

  it('logs, per registered-only registration, each event it would emit under dry-run with recovered actor and membership', async () => {
    seedSummary({
      organisationsScanned: 3,
      registrationsScanned: 1,
      submissionsScanned: 2,
      submittedEventWrites: 2,
      registeredOnlyPlan: [
        {
          organisationId: 'org-1',
          registrationId: 'reg-ro',
          plannedEvents: [
            {
              summaryLogId: 'file-sl-1',
              submittedAt: '2025-01-01T00:00:00.000Z',
              submittedBy: { id: 'user-1', email: 'ada@example.com' },
              membershipRowIds: ['row-1', 'row-2']
            },
            {
              summaryLogId: 'file-sl-2',
              submittedAt: '2025-02-01T00:00:00.000Z',
              membershipRowIds: ['row-1']
            }
          ]
        }
      ]
    })

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill would emit: organisationId=org-1 registrationId=reg-ro summaryLogId=file-sl-1 submittedAt=2025-01-01T00:00:00.000Z actor=recovered(id=user-1) membership=[row-1,row-2]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill would emit: organisationId=org-1 registrationId=reg-ro summaryLogId=file-sl-2 submittedAt=2025-02-01T00:00:00.000Z actor=backfill membership=[row-1]'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill has unattributed events: organisationId=org-1 registrationId=reg-ro attributionMatrix=summary-log-submitted{displayAndContact:0,displayOnly:0,contactOnly:1,idOnly:0,noActor:1,scope:0}'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill dry-run complete (no writes): organisationsScanned=3 registrationsScanned=1 submissionsScanned=2 submittedEventWrites=2 registeredOnlyRegistrations=1 attributionMatrix=summary-log-submitted{displayAndContact:0,displayOnly:0,contactOnly:1,idOnly:0,noActor:1,scope:0}'
    })
  })

  it('logs emitted events and an executed summary when the flag is on', async () => {
    mockServer.featureFlags.isRegisteredOnlySubmittedEventsEnabled = () => true
    seedSummary({
      organisationsScanned: 1,
      registrationsScanned: 1,
      submissionsScanned: 1,
      submittedEventWrites: 1,
      registeredOnlyPlan: [
        {
          organisationId: 'org-1',
          registrationId: 'reg-ro',
          plannedEvents: [
            {
              summaryLogId: 'file-sl-1',
              submittedAt: '2025-01-01T00:00:00.000Z',
              submittedBy: { id: 'user-1' },
              membershipRowIds: ['row-1']
            }
          ]
        }
      ]
    })

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill emitted: organisationId=org-1 registrationId=reg-ro summaryLogId=file-sl-1 submittedAt=2025-01-01T00:00:00.000Z actor=recovered(id=user-1) membership=[row-1]'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registered-only submitted-events backfill complete: organisationsScanned=1 registrationsScanned=1 submissionsScanned=1 submittedEventWrites=1 registeredOnlyRegistrations=1 attributionMatrix=summary-log-submitted{displayAndContact:0,displayOnly:0,contactOnly:0,idOnly:1,noActor:0,scope:0}'
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the backfill throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(backfillRegisteredOnlySubmittedEvents).mockRejectedValue(error)

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run registered-only submitted-events backfill'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runRegOnlySubmittedEventsBackfill(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run registered-only submitted-events backfill'
    })
  })
})
