import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { config } from '../config.js'

import { removeTestOrganisationData } from './application/removal.js'
import { runTestOrganisationDataRemoval } from './run.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('./mongodb.js', () => ({
  createTestOrganisationRecords: vi.fn(() => ({}))
}))
vi.mock('./application/removal.js', async (importOriginal) => ({
  .../** @type {*} */ (await importOriginal()),
  removeTestOrganisationData: vi.fn()
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))
vi.mock('#common/helpers/parse-test-organisations.js', () => ({
  TEST_ORGANISATION_NUMBERS: new Set()
}))

const ledger = {
  organisationNumber: toOrganisationNumber('500521'),
  registrationNumber: toRegistrationNumber('TEST-REG-0123'),
  year: toYear(2026)
}

describe('runTestOrganisationDataRemoval', () => {
  /** @type {*} */
  let lock
  /** @type {*} */
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    lock = { free: vi.fn() }
    server = {
      db: {},
      app: { systemLogsRepository: {} },
      locker: { lock: vi.fn().mockResolvedValue(lock) }
    }
    vi.mocked(removeTestOrganisationData).mockResolvedValue({
      removed: [
        {
          ledger: {
            ...ledger,
            accreditationNumber: toAccreditationNumber('test-acc-0123')
          },
          counts: {
            events: 3,
            rowStates: 2,
            reports: 1,
            prns: 4,
            summaryLogs: 1
          },
          sources: { summaryLogIds: ['log-1'], prnIds: ['prn-1', 'prn-2'] }
        },
        {
          ledger,
          counts: {
            events: 0,
            rowStates: 0,
            reports: 0,
            prns: 0,
            summaryLogs: 1
          },
          sources: { summaryLogIds: ['log-2'], prnIds: [] }
        }
      ],
      unnumbered: [
        {
          organisationNumber: toOrganisationNumber('500521'),
          organisationId: '6969171b94f6a09a01e1bc7e',
          summaryLogIds: ['log-3', 'log-4'],
          removed: 2
        }
      ],
      skipped: 0,
      failed: 0,
      auditFailed: 0
    })
  })

  it('runs as a dry run when the flag is off, and logs what it would remove', async () => {
    vi.mocked(config.get).mockReturnValue(false)

    await runTestOrganisationDataRemoval(server)

    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.testOrganisationDataRemoval'
    )
    expect(removeTestOrganisationData).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: true
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Test organisation data removal (dry-run): ledgers=2 unnumbered=1 skipped=0 failed=0 auditFailed=0' +
        '; organisationNumber=500521 registrationNumber=TEST-REG-0123 accreditationNumber=test-acc-0123 year=2026: events=3 rowStates=2 reports=1 prns=4 summaryLogs=1 summaryLogIds=log-1 prnIds=prn-1,prn-2' +
        '; organisationNumber=500521 registrationNumber=TEST-REG-0123 accreditationNumber=absent year=2026: events=0 rowStates=0 reports=0 prns=0 summaryLogs=1 summaryLogIds=log-2 prnIds=' +
        '; organisationNumber=500521 organisationId=6969171b94f6a09a01e1bc7e: summaryLogs=2 summaryLogIds=log-3,log-4'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('removes when the flag is on', async () => {
    vi.mocked(config.get).mockReturnValue(true)

    await runTestOrganisationDataRemoval(server)

    expect(removeTestOrganisationData).toHaveBeenCalledWith(expect.anything(), {
      isDryRun: false
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('(removal)')
    })
  })

  it('skips when the lock is not obtained', async () => {
    server.locker.lock.mockResolvedValue(null)

    await runTestOrganisationDataRemoval(server)

    expect(removeTestOrganisationData).not.toHaveBeenCalled()
  })

  it('logs and frees the lock when the removal throws', async () => {
    const error = new Error('boom')
    vi.mocked(removeTestOrganisationData).mockRejectedValue(error)

    await runTestOrganisationDataRemoval(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run test organisation data removal'
    })
    expect(lock.free).toHaveBeenCalled()
  })
})
