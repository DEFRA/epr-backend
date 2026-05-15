import { describe, it, expect, vi } from 'vitest'

import { createInMemoryStreamRepository } from '../repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { StreamSlotConflictError } from '../repository/stream-port.js'
import { appendToStream } from './append-to-stream.js'

const buildContext = (overrides = {}) => ({
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  ...overrides
})

const createdBy = { id: 'user-1', name: 'Test User' }

describe('appendToStream', () => {
  describe('summary-log-submitted', () => {
    it('first submission: delta equals creditTotal, opening balance is zero', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = {
        repository,
        ...buildContext()
      }

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1500 },
        createdBy
      })

      expect(result.number).toBe(1)
      expect(result.openingBalance).toEqual({ amount: 0, availableAmount: 0 })
      expect(result.closingBalance).toEqual({
        amount: 1500,
        availableAmount: 1500
      })
    })

    it('second submission: delta is creditTotal minus previousCreditTotal', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 2000 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-2', creditTotal: 3500 },
        createdBy
      })

      expect(result.number).toBe(2)
      expect(result.openingBalance).toEqual({
        amount: 2000,
        availableAmount: 2000
      })
      expect(result.closingBalance).toEqual({
        amount: 3500,
        availableAmount: 3500
      })
    })

    it('submission with lower creditTotal than previous produces a negative delta', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 2000 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-2', creditTotal: 1000 },
        createdBy
      })

      expect(result.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })

    it('uses openingBalance from the latest event of any kind, not just latest submission', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 2000 },
        createdBy
      })

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 800 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-2', creditTotal: 3500 },
        createdBy
      })

      expect(result.number).toBe(3)
      expect(result.openingBalance).toEqual({
        amount: 2000,
        availableAmount: 1200
      })
      expect(result.closingBalance).toEqual({
        amount: 3500,
        availableAmount: 2700
      })
    })

    it('slot conflict surfaces to caller', async () => {
      const slotConflict = new StreamSlotConflictError('reg-1', 'acc-1', 1)
      const repository = /** @type {*} */ ({
        findLatestByPartition: vi.fn().mockResolvedValue(null),
        findLatestByPartitionAndKind: vi.fn().mockResolvedValue(null),
        appendEvent: vi.fn().mockRejectedValue(slotConflict)
      })

      await expect(
        appendToStream(
          { repository, ...buildContext() },
          {
            kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
            payload: { summaryLogId: 'log-1', creditTotal: 100 },
            createdBy
          }
        )
      ).rejects.toBe(slotConflict)
    })
  })

  describe('prn-created', () => {
    it('decrements closingBalance.availableAmount by PRN amount; amount unchanged', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1000 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      expect(result.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 700
      })
    })

    it('openingBalance taken from latest event', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1000 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      expect(result.openingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })
  })

  describe('prn-issued', () => {
    it('decrements closingBalance.amount by PRN amount; availableAmount unchanged', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1000 },
        createdBy
      })
      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_ISSUED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      expect(result.closingBalance).toEqual({
        amount: 700,
        availableAmount: 700
      })
    })
  })

  describe('prn-creation-cancelled', () => {
    it('increments closingBalance.availableAmount by PRN amount; amount unchanged', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1000 },
        createdBy
      })
      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      expect(result.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })
  })

  describe('prn-cancelled-after-issue', () => {
    it('increments both closingBalance.amount and closingBalance.availableAmount', async () => {
      const repository = createInMemoryStreamRepository()()
      const context = { repository, ...buildContext() }

      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'log-1', creditTotal: 1000 },
        createdBy
      })
      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })
      await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_ISSUED,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      const result = await appendToStream(context, {
        kind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        payload: { prnId: 'prn-1', amount: 300 },
        createdBy
      })

      expect(result.closingBalance).toEqual({
        amount: 1000,
        availableAmount: 1000
      })
    })
  })

  describe('unknown kind', () => {
    it('throws for an unrecognised PRN event kind', async () => {
      const repository = /** @type {*} */ ({
        findLatestByPartition: vi.fn().mockResolvedValue(null),
        findLatestByPartitionAndKind: vi.fn().mockResolvedValue(null),
        appendEvent: vi.fn()
      })

      await expect(
        appendToStream(
          { repository, ...buildContext() },
          {
            kind: /** @type {*} */ ('unknown-kind'),
            payload: { prnId: 'prn-1', amount: 100 },
            createdBy
          }
        )
      ).rejects.toThrow('Unknown PRN event kind: unknown-kind')
    })
  })
})
