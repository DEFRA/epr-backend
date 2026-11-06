import { logger } from '#common/helpers/logging/logger.js'
import { diagnoseNaturalKeyIndexes } from '#natural-key-index-diagnostic/application/diagnose-natural-key-indexes.js'
import { partialMock } from '#test/type-helpers.js'

import { runNaturalKeyIndexDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { NaturalKeyIndexDiagnosis } from '#natural-key-index-diagnostic/application/diagnose-natural-key-indexes.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock(
  '#natural-key-index-diagnostic/application/diagnose-natural-key-indexes.js',
  () => ({ diagnoseNaturalKeyIndexes: vi.fn() })
)

/** @type {NaturalKeyIndexDiagnosis} */
const CLEAR = {
  summaryLogs: 10,
  submittingSummaryLogsWithoutNumbers: 0,
  validatedSummaryLogsWithoutNumbers: 0,
  submittingLockClashes: 0,
  reports: 20,
  reportsWithoutNumbers: 0,
  sharedReportNumbers: [],
  prns: 40,
  prnsWithoutNumbers: 0,
  ledgerEvents: 50,
  ledgerEventsWithoutNumbers: 0
}

describe('runNaturalKeyIndexDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock

  beforeEach(() => {
    vi.clearAllMocks()

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      db: partialMock({}),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })
    vi.mocked(diagnoseNaturalKeyIndexes).mockResolvedValue(CLEAR)
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runNaturalKeyIndexDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'natural-key-index-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runNaturalKeyIndexDiagnostic(server)

    expect(diagnoseNaturalKeyIndexes).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping natural key index diagnostic'
    })
  })

  it('logs the counts on one line', async () => {
    await runNaturalKeyIndexDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message:
            'Natural key index diagnostic: summaryLogs=10 submittingSummaryLogsWithoutNumbers=0 validatedSummaryLogsWithoutNumbers=0 submittingLockClashes=0 reports=20 reportsWithoutNumbers=0 sharedReportNumbers=0 prns=40 prnsWithoutNumbers=0 ledgerEvents=50 ledgerEventsWithoutNumbers=0'
        }
      ]
    ])
  })

  it('logs each pair of report numbers shared by more than one id pair before the counts', async () => {
    vi.mocked(diagnoseNaturalKeyIndexes).mockResolvedValue({
      ...CLEAR,
      sharedReportNumbers: [
        {
          organisationNumber: '500001',
          registrationNumber: 'R1',
          idPairs: [
            { organisationId: 'o1', registrationId: 'r1' },
            { organisationId: 'o2', registrationId: 'r2' }
          ]
        },
        {
          idPairs: [
            { organisationId: 'o3', registrationId: 'r3' },
            { organisationId: 'o4', registrationId: 'r4' }
          ]
        }
      ]
    })

    await runNaturalKeyIndexDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls.slice(0, 2)).toStrictEqual([
      [
        {
          message:
            'Report numbers shared by more than one id pair: organisationNumber=500001 registrationNumber=R1 idPairs=o1/r1,o2/r2'
        }
      ],
      [
        {
          message:
            'Report numbers shared by more than one id pair: organisationNumber=missing registrationNumber=missing idPairs=o3/r3,o4/r4'
        }
      ]
    ])
  })

  it('releases the lock and logs an error when the diagnosis fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(diagnoseNaturalKeyIndexes).mockRejectedValue(error)

    await runNaturalKeyIndexDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run natural key index diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runNaturalKeyIndexDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run natural key index diagnostic'
    })
  })
})
