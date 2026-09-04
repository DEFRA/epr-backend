import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { config } from '../config.js'

import { createStreamUsageQuery } from './repository/stream-usage-query.mongodb.js'
import { diagnoseStreamTransitions } from './application/diagnose-stream-transitions.js'
import { diagnoseRegAccStatus } from './application/diagnose-reg-acc-status.js'
import { runStreamTransitionDiagnostic } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('./repository/stream-usage-query.mongodb.js', () => ({
  createStreamUsageQuery: vi.fn()
}))
vi.mock('./application/diagnose-stream-transitions.js', () => ({
  diagnoseStreamTransitions: vi.fn()
}))
vi.mock('./application/diagnose-reg-acc-status.js', () => ({
  diagnoseRegAccStatus: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

const emptyTransitionResult = {
  reports: [],
  summary: {
    scanned: 0,
    affectedOrganisations: 0,
    registeredToAccredited: 0,
    accreditedToRegistered: 0,
    registeredOnlySubmissions: 0,
    accreditedSubmissions: 0
  }
}

const emptyStatusResult = {
  reports: [],
  summary: {
    organisations: 0,
    currentlySuspendedAccreditations: 0,
    currentlyCancelledAccreditations: 0,
    currentlyCancelledRegistrations: 0,
    previouslySuspendedNowApproved: 0,
    previouslyCancelledNowApproved: 0,
    totalSuspensionEvents: 0,
    totalCancellationEvents: 0
  }
}

describe('runStreamTransitionDiagnostic', () => {
  /** @type {*} */
  let mockServer
  /** @type {*} */
  let mockLock
  /** @type {*} */
  let mockRepository
  /** @type {*} */
  let mockStreamUsageQuery

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }

    mockRepository = { findAll: vi.fn().mockResolvedValue([]) }
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => mockRepository
    )

    mockStreamUsageQuery = vi.fn().mockResolvedValue({ scanned: 0, usages: [] })
    vi.mocked(createStreamUsageQuery).mockReturnValue(mockStreamUsageQuery)

    vi.mocked(diagnoseStreamTransitions).mockReturnValue(emptyTransitionResult)
    vi.mocked(diagnoseRegAccStatus).mockReturnValue(emptyStatusResult)

    vi.mocked(config.get).mockReturnValue(true)
  })

  it('does no database work and logs nothing when the feature flag is off', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runStreamTransitionDiagnostic(mockServer)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.streamTransitionDiagnostic'
    )
    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runStreamTransitionDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'stream-transition-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runStreamTransitionDiagnostic(mockServer)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping stream transition diagnostic'
    })
  })

  it('logs one line per transition report plus the summary', async () => {
    vi.mocked(diagnoseStreamTransitions).mockReturnValue({
      reports: [
        {
          organisationId: 'org-1',
          orgId: 500123,
          orgName: 'Acme Ltd',
          registrationId: 'reg-1',
          registrationNumber: 'R26ER5000000001PL',
          accreditationId: 'acc-1',
          accreditationNumber: 'A26ER5000000001PL',
          direction: 'registered_to_accredited',
          registeredOnlySubmissions: 3,
          accreditedSubmissions: 5,
          registeredOnlyLastSubmittedAt: '2026-03-28',
          accreditedFirstSubmittedAt: '2026-04-02',
          registrationHistory: 'created@2026-01-12 -> approved@2026-02-01',
          accreditationHistory:
            'created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-07-15',
          material: 'plastic'
        }
      ],
      summary: {
        scanned: 1234,
        affectedOrganisations: 1,
        registeredToAccredited: 1,
        accreditedToRegistered: 0,
        registeredOnlySubmissions: 3,
        accreditedSubmissions: 5
      }
    })

    await runStreamTransitionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stream transition: organisationId=org-1 orgId=500123 orgName="Acme Ltd" registrationId=reg-1 registrationNumber=R26ER5000000001PL accreditationId=acc-1 accreditationNumber=A26ER5000000001PL direction=registered_to_accredited registeredOnlySubmissions=3 accreditedSubmissions=5 registeredOnlyLastSubmittedAt=2026-03-28 accreditedFirstSubmittedAt=2026-04-02 registrationHistory="created@2026-01-12 -> approved@2026-02-01" accreditationHistory="created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-07-15" material=plastic'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Stream transition diagnostic: scanned=1234 affectedOrganisations=1 registeredToAccredited=1 accreditedToRegistered=0 registeredOnlySubmissions=3 accreditedSubmissions=5'
    })
  })

  it('logs one line per reg/acc status report on its own line-type prefix, plus the summary', async () => {
    vi.mocked(diagnoseRegAccStatus).mockReturnValue({
      reports: [
        {
          organisationId: 'org-2',
          orgId: 500124,
          orgName: 'Beta Ltd',
          kind: 'accreditation',
          line: 'currentlySuspended',
          registrationId: 'reg-2',
          registrationNumber: 'R26ER5000000002PL',
          accreditationId: 'acc-2',
          accreditationNumber: 'A26ER5000000002PL',
          currentStatus: null,
          suspensionCount: 1,
          cancellationCount: 0,
          registrationHistory: 'created@2026-01-12 -> approved@2026-02-01',
          accreditationHistory:
            'created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-07-15',
          material: 'plastic'
        },
        {
          organisationId: 'org-3',
          orgId: 500125,
          orgName: 'Gamma Ltd',
          kind: 'accreditation',
          line: 'previously',
          registrationId: 'reg-3',
          registrationNumber: 'R26ER5000000003PL',
          accreditationId: 'acc-3',
          accreditationNumber: 'A26ER5000000003PL',
          currentStatus: 'approved',
          suspensionCount: 2,
          cancellationCount: 0,
          registrationHistory: 'created@2026-01-12 -> approved@2026-02-01',
          accreditationHistory:
            'created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-05-02 -> approved@2026-06-11 -> suspended@2026-08-01 -> approved@2026-09-01',
          material: 'plastic'
        }
      ],
      summary: {
        organisations: 890,
        currentlySuspendedAccreditations: 4,
        currentlyCancelledAccreditations: 2,
        currentlyCancelledRegistrations: 9,
        previouslySuspendedNowApproved: 7,
        previouslyCancelledNowApproved: 1,
        totalSuspensionEvents: 11,
        totalCancellationEvents: 15
      }
    })

    await runStreamTransitionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reg/acc currently suspended: organisationId=org-2 orgId=500124 orgName="Beta Ltd" kind=accreditation registrationId=reg-2 registrationNumber=R26ER5000000002PL accreditationId=acc-2 accreditationNumber=A26ER5000000002PL suspensionCount=1 cancellationCount=0 registrationHistory="created@2026-01-12 -> approved@2026-02-01" accreditationHistory="created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-07-15" material=plastic'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reg/acc previously suspended or cancelled: organisationId=org-3 orgId=500125 orgName="Gamma Ltd" kind=accreditation registrationId=reg-3 registrationNumber=R26ER5000000003PL accreditationId=acc-3 accreditationNumber=A26ER5000000003PL currentStatus=approved suspensionCount=2 cancellationCount=0 registrationHistory="created@2026-01-12 -> approved@2026-02-01" accreditationHistory="created@2026-02-10 -> approved@2026-04-01 -> suspended@2026-05-02 -> approved@2026-06-11 -> suspended@2026-08-01 -> approved@2026-09-01" material=plastic'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reg/acc status diagnostic: organisations=890 currentlySuspendedAccreditations=4 currentlyCancelledAccreditations=2 currentlyCancelledRegistrations=9 previouslySuspendedNowApproved=7 previouslyCancelledNowApproved=1 totalSuspensionEvents=11 totalCancellationEvents=15'
    })
  })

  it('renders "none" for null registration/accreditation identity fields', async () => {
    vi.mocked(diagnoseRegAccStatus).mockReturnValue({
      reports: [
        {
          organisationId: 'org-4',
          orgId: 500126,
          orgName: 'Delta Ltd',
          kind: 'accreditation',
          line: 'currentlySuspended',
          registrationId: null,
          registrationNumber: null,
          accreditationId: 'acc-4',
          accreditationNumber: 'A26ER5000000004PL',
          currentStatus: null,
          suspensionCount: 1,
          cancellationCount: 0,
          registrationHistory: 'none',
          accreditationHistory: 'created@2026-01-01 -> suspended@2026-02-01',
          material: 'plastic'
        },
        {
          organisationId: 'org-5',
          orgId: 500127,
          orgName: 'Epsilon Ltd',
          kind: 'registration',
          line: 'currentlyCancelled',
          registrationId: 'reg-5',
          registrationNumber: 'R26ER5000000005PL',
          accreditationId: null,
          accreditationNumber: null,
          currentStatus: null,
          suspensionCount: 0,
          cancellationCount: 1,
          registrationHistory: 'created@2026-01-01 -> cancelled@2026-02-01',
          accreditationHistory: 'none',
          material: 'plastic'
        }
      ],
      summary: emptyStatusResult.summary
    })

    await runStreamTransitionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'registrationId=none registrationNumber=none'
      )
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'accreditationId=none accreditationNumber=none'
      )
    })
  })

  it('releases the lock and logs an error when the repository throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runStreamTransitionDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run stream transition diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runStreamTransitionDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run stream transition diagnostic'
    })
  })
})
