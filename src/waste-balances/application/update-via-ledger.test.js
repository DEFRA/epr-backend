import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import { LedgerSlotConflictError } from '../repository/ledger-port.js'
import { performUpdateViaLedger } from './update-via-ledger.js'
import { createWasteBalanceService } from './waste-balance-service.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'audit.maxPayloadSizeBytes') {
        return 10000
      }
      return undefined
    })
  }
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

const accreditationId = 'acc-1'

const ledgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId
}

const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.test',
  scope: ['some-scope'],
  role: 'standard_user'
}

describe('performUpdateViaLedger', () => {
  let ledgerRepository
  let systemLogsRepository
  let commitSummaryLogSubmittedEvent

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    systemLogsRepository = createSystemLogsRepository()(logger)
    commitSummaryLogSubmittedEvent = createWasteBalanceService(
      ledgerRepository,
      systemLogsRepository
    ).commitSummaryLogSubmittedEvent
  })

  const submit = (summaryLogId, creditTotal, overrides = {}) =>
    performUpdateViaLedger({
      ledgerId,
      creditTotal,
      commitSummaryLogSubmittedEvent,
      dependencies: { systemLogsRepository },
      user,
      summaryLogId,
      ...overrides
    })

  describe('first submission', () => {
    it('appends a single summary-log-submitted event carrying the credit total', async () => {
      await submit('log-A', 150)

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)
      expect(latest.number).toBe(1)
      expect(latest.kind).toBe(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      expect(latest.payload).toEqual({
        summaryLogId: 'log-A',
        creditTotal: 150
      })
      expect(latest.closingBalance).toEqual({
        amount: 150,
        availableAmount: 150
      })
    })
  })

  describe('subsequent submission', () => {
    it('computes delta from previous creditTotal', async () => {
      await submit('log-A', 150)
      await submit('log-B', 200)

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)
      expect(latest.number).toBe(2)
      expect(latest.payload).toEqual({
        summaryLogId: 'log-B',
        creditTotal: 200
      })
      expect(latest.closingBalance).toEqual({
        amount: 200,
        availableAmount: 200
      })
    })
  })

  describe('audit emission', () => {
    it('inserts one system-log entry covering the submission', async () => {
      await submit('log-A', 150)

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)

      const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
      expect(systemLogs).toHaveLength(1)
      const [entry] = systemLogs
      expect(entry.createdBy).toEqual({ ...user, role: null })
      expect(entry.createdAt).toBeInstanceOf(Date)
      expect(entry.event).toEqual({
        category: 'waste-reporting',
        subCategory: 'waste-balance',
        action: 'update'
      })
      expect(entry.context).toEqual({
        accreditationId,
        amount: 150,
        availableAmount: 150,
        events: [latest]
      })
    })
  })

  describe('without a system-logs repository', () => {
    it('appends the ledger event but emits no back-office audit', async () => {
      const auditlessSubmit =
        createWasteBalanceService(
          ledgerRepository
        ).commitSummaryLogSubmittedEvent

      await performUpdateViaLedger({
        ledgerId,
        creditTotal: 100,
        commitSummaryLogSubmittedEvent: auditlessSubmit,
        dependencies: {},
        user,
        summaryLogId: 'log-A'
      })

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)
      expect(latest.number).toBe(1)
      expect(latest.payload.creditTotal).toBe(100)

      const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
      expect(systemLogs).toHaveLength(0)
    })
  })

  describe('actor attribution', () => {
    it('stamps createdBy with the submitter id, name and email', async () => {
      await submit('log-A', 50)

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)
      expect(latest.createdBy).toEqual({
        id: user.id,
        name: user.name,
        email: user.email
      })
    })

    it('omits name when the submitter has none, keeping the email distinct', async () => {
      await submit('log-A', 50, {
        user: {
          id: 'user-2',
          email: 'noname@example.test',
          scope: [],
          role: null
        }
      })

      const latest = await ledgerRepository.findLatestInLedger(ledgerId)
      expect(latest.createdBy).toEqual({
        id: 'user-2',
        email: 'noname@example.test'
      })
    })
  })

  describe('optimistic concurrency', () => {
    it('lets one of two concurrent submissions win and surfaces the loser as a slot conflict', async () => {
      const results = await Promise.allSettled([
        submit('log-A', 150),
        submit('log-B', 200)
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(LedgerSlotConflictError)

      const all = await ledgerRepository.findAllInLedger(ledgerId)
      expect(all).toHaveLength(1)
    })
  })
})
