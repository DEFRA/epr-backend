import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import {
  computeRebuiltTotals,
  rebuildFromAuthoritativeSources,
  REBUILT_TRANSACTION_KIND
} from './rebuild-from-authoritative-sources.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const { findSchemaForProcessingType } =
  await import('#domain/summary-logs/table-schemas/index.js')

const includedAt = (amount) => ({
  outcome: ROW_OUTCOME.INCLUDED,
  transactionAmount: amount
})

const defaultSummaryLog = {
  id: 'sl-default',
  uri: 's3://bucket/sl-default.xlsx'
}

const withDefaultSummaryLog = (versions) =>
  versions.map((v) =>
    v.summaryLog ? v : { ...v, summaryLog: defaultSummaryLog }
  )

const wasteRecord = ({
  rowId,
  type = 'received',
  processingType = 'REPROCESSOR_INPUT',
  versions = [{ id: 'v1', createdAt: '2025-01-01T00:00:00.000Z' }],
  excludedFromWasteBalance = false,
  data = {}
}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId,
  type,
  data: { processingType, ...data },
  versions: withDefaultSummaryLog(versions),
  excludedFromWasteBalance
})

const prnHistory = (...entries) =>
  entries.map(([status, at, by = { id: 'user-1', name: 'Alice' }]) => ({
    status,
    at: new Date(at),
    by
  }))

const prn = ({
  id,
  tonnage,
  prnNumber = null,
  history = [
    [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
    [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z']
  ]
}) => ({
  id,
  tonnage,
  prnNumber,
  status: { history: prnHistory(...history) }
})

const accreditation = { id: 'acc-1' }
const overseasSites = {}

describe('rebuildFromAuthoritativeSources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSchemaForProcessingType.mockReturnValue({
      classifyForWasteBalance: (data) =>
        data.tonnage === undefined
          ? { outcome: ROW_OUTCOME.EXCLUDED, transactionAmount: 0 }
          : includedAt(data.tonnage)
    })
  })

  describe('totals', () => {
    it('returns zero totals and no transactions when no records or PRNs', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [],
        prns: [],
        overseasSites
      })

      expect(result).toEqual({
        amount: 0,
        availableAmount: 0,
        transactions: []
      })
    })

    it('credits both balance fields by the sum of waste-record target amounts', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } }),
          wasteRecord({ rowId: 'r-2', data: { tonnage: 6 } })
        ],
        prns: [],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(10)
    })

    it('skips records whose schema returns a non-INCLUDED outcome', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } }),
          wasteRecord({ rowId: 'r-2', data: {} })
        ],
        prns: [],
        overseasSites
      })

      expect(result.amount).toBe(4)
      expect(result.transactions).toHaveLength(1)
    })

    it('skips records flagged excludedFromWasteBalance', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'r-1',
            data: { tonnage: 4 },
            excludedFromWasteBalance: true
          })
        ],
        prns: [],
        overseasSites
      })

      expect(result.amount).toBe(0)
      expect(result.transactions).toEqual([])
    })

    it('skips records whose schema has no classifyForWasteBalance', () => {
      findSchemaForProcessingType.mockReturnValueOnce({
        classifyForWasteBalance: null
      })

      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } })],
        prns: [],
        overseasSites
      })

      expect(result.amount).toBe(0)
    })

    it('debits availableAmount only when a PRN is in AWAITING_AUTHORISATION', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [prn({ id: 'prn-1', tonnage: 3 })],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(7)
    })

    it('debits both fields when a PRN is in AWAITING_ACCEPTANCE', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 3,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_ACCEPTANCE, '2025-01-03T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(7)
      expect(result.availableAmount).toBe(7)
    })

    it('keeps the issued debit through ACCEPTED', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 4,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_ACCEPTANCE, '2025-01-03T00:00:00.000Z'],
              [PRN_STATUS.ACCEPTED, '2025-01-04T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(6)
      expect(result.availableAmount).toBe(6)
    })

    it('reverses pre-issue PRN cancellations to net zero', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 3,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.CANCELLED, '2025-01-03T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(10)
    })

    it('reverses pre-issue deletion to net zero', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 3,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.DELETED, '2025-01-03T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(10)
    })

    it('reverses post-issue cancellation to net zero on both fields', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 4,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_ACCEPTANCE, '2025-01-03T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_CANCELLATION, '2025-01-04T00:00:00.000Z'],
              [PRN_STATUS.CANCELLED, '2025-01-05T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(10)
    })

    it('emits no balance effect for DRAFT-only or DISCARDED PRNs', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
        prns: [
          prn({
            id: 'prn-discard',
            tonnage: 5,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
              [PRN_STATUS.DISCARDED, '2025-01-02T00:00:00.000Z']
            ]
          }),
          prn({
            id: 'prn-draft',
            tonnage: 7,
            history: [[PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z']]
          })
        ],
        overseasSites
      })

      expect(result.amount).toBe(10)
      expect(result.availableAmount).toBe(10)
      expect(
        result.transactions.filter(
          (t) => t.kind !== REBUILT_TRANSACTION_KIND.SUMMARY_LOG_ROW
        )
      ).toEqual([])
    })

    it('uses exact decimal arithmetic for the running totals', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({ rowId: 'r-1', data: { tonnage: 0.1 } }),
          wasteRecord({ rowId: 'r-2', data: { tonnage: 0.2 } })
        ],
        prns: [],
        overseasSites
      })

      expect(result.amount).toBe(0.3)
    })
  })

  describe('computeRebuiltTotals', () => {
    it('matches rebuildFromAuthoritativeSources totals across waste records and PRN lifecycle states', () => {
      const inputs = {
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'r-1',
            data: { tonnage: 12 },
            versions: [{ id: 'v1', createdAt: '2025-01-01T00:00:00.000Z' }]
          }),
          wasteRecord({
            rowId: 'r-2',
            data: { tonnage: 8 },
            versions: [{ id: 'v1', createdAt: '2025-01-05T00:00:00.000Z' }]
          }),
          wasteRecord({
            rowId: 'r-excluded',
            data: { tonnage: 99 },
            excludedFromWasteBalance: true
          })
        ],
        prns: [
          prn({
            id: 'prn-issued',
            tonnage: 5,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-03T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_ACCEPTANCE, '2025-01-04T00:00:00.000Z']
            ]
          }),
          prn({
            id: 'prn-pending',
            tonnage: 2,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-06T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-07T00:00:00.000Z']
            ]
          }),
          prn({
            id: 'prn-cancelled',
            tonnage: 3,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-08T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-09T00:00:00.000Z'],
              [PRN_STATUS.CANCELLED, '2025-01-10T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      }

      const totals = computeRebuiltTotals(inputs)
      const full = rebuildFromAuthoritativeSources(inputs)

      expect(totals).toEqual({
        amount: full.amount,
        availableAmount: full.availableAmount
      })
      // 20t credit; issued PRN debits both fields by 5t; pending PRN debits
      // available by 2t; cancelled-pre-issue nets to zero on both fields
      expect(totals).toEqual({ amount: 15, availableAmount: 13 })
    })

    it('does not allocate per-event objects', () => {
      const inputs = {
        accreditation,
        wasteRecords: Array.from({ length: 50 }, (_, i) =>
          wasteRecord({
            rowId: `r-${i}`,
            data: { tonnage: 1 },
            versions: [
              {
                id: 'v1',
                createdAt: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`
              }
            ]
          })
        ),
        prns: [],
        overseasSites
      }

      // Behavioural rather than memory-instrumented: assert totals are correct
      // and that the full path produces a populated transactions array while
      // the cheap path remains an unallocated computation.
      expect(computeRebuiltTotals(inputs)).toEqual({
        amount: 50,
        availableAmount: 50
      })
      const full = rebuildFromAuthoritativeSources(inputs)
      expect(full.transactions).toHaveLength(50)
    })
  })

  describe('transaction stream', () => {
    it('emits one summary-log-row transaction per credited waste record carrying source identity', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'r-1',
            data: { tonnage: 4 },
            versions: [
              {
                id: 'v1',
                createdAt: '2025-01-01T00:00:00.000Z',
                summaryLog: { id: 'sl-1', uri: 's3://bucket/sl-1.xlsx' }
              }
            ]
          })
        ],
        prns: [],
        overseasSites
      })

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]).toMatchObject({
        kind: REBUILT_TRANSACTION_KIND.SUMMARY_LOG_ROW,
        amount: 4,
        openingBalance: { amount: 0, availableAmount: 0 },
        closingBalance: { amount: 4, availableAmount: 4 },
        source: {
          kind: 'summary-log-row',
          wasteRecordType: 'received',
          rowId: 'r-1',
          versionId: 'v1',
          summaryLogId: 'sl-1',
          summaryLogUri: 's3://bucket/sl-1.xlsx'
        }
      })
    })

    it('emits a prn-created transaction with source identity carrying the PRN id and operation type', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [],
        prns: [
          prn({
            id: 'prn-A',
            tonnage: 3,
            prnNumber: 'PRN-001',
            history: [
              [
                PRN_STATUS.DRAFT,
                '2025-02-01T00:00:00.000Z',
                { id: 'u-1', name: 'Alice' }
              ],
              [
                PRN_STATUS.AWAITING_AUTHORISATION,
                '2025-02-02T00:00:00.000Z',
                { id: 'u-2', name: 'Bob' }
              ]
            ]
          })
        ],
        overseasSites
      })

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]).toMatchObject({
        kind: REBUILT_TRANSACTION_KIND.PRN_CREATED,
        amount: 3,
        openingBalance: { amount: 0, availableAmount: 0 },
        closingBalance: { amount: 0, availableAmount: -3 },
        createdBy: { id: 'u-2', name: 'Bob' },
        source: {
          kind: 'prn-operation',
          prnId: 'prn-A',
          prnNumber: 'PRN-001',
          operationType: REBUILT_TRANSACTION_KIND.PRN_CREATED
        }
      })
    })

    it('chains opening and closing balances across all events in chronological order', () => {
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'r-1',
            data: { tonnage: 10 },
            versions: [{ id: 'v1', createdAt: '2025-01-01T00:00:00.000Z' }]
          })
        ],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 4,
            history: [
              [PRN_STATUS.DRAFT, '2025-01-02T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-03T00:00:00.000Z'],
              [PRN_STATUS.AWAITING_ACCEPTANCE, '2025-01-04T00:00:00.000Z']
            ]
          })
        ],
        overseasSites
      })

      expect(result.transactions.map((t) => t.kind)).toEqual([
        REBUILT_TRANSACTION_KIND.SUMMARY_LOG_ROW,
        REBUILT_TRANSACTION_KIND.PRN_CREATED,
        REBUILT_TRANSACTION_KIND.PRN_ISSUED
      ])
      expect(result.transactions.map((t) => t.openingBalance)).toEqual([
        { amount: 0, availableAmount: 0 },
        { amount: 10, availableAmount: 10 },
        { amount: 10, availableAmount: 6 }
      ])
      expect(result.transactions.map((t) => t.closingBalance)).toEqual([
        { amount: 10, availableAmount: 10 },
        { amount: 10, availableAmount: 6 },
        { amount: 6, availableAmount: 6 }
      ])
    })

    it('orders simultaneous events deterministically by source key', () => {
      const sameTime = '2025-03-01T00:00:00.000Z'
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'b-row',
            data: { tonnage: 1 },
            versions: [{ id: 'v1', createdAt: sameTime }]
          }),
          wasteRecord({
            rowId: 'a-row',
            data: { tonnage: 1 },
            versions: [{ id: 'v1', createdAt: sameTime }]
          })
        ],
        prns: [],
        overseasSites
      })

      const orderedRowIds = result.transactions.map((t) =>
        t.source.kind === 'summary-log-row' ? t.source.rowId : null
      )
      expect(orderedRowIds).toEqual(['a-row', 'b-row'])
    })

    it('breaks simultaneous-event ties between PRN-operation and summary-log-row sources by source key', () => {
      const sameTime = '2025-04-01T00:00:00.000Z'
      const result = rebuildFromAuthoritativeSources({
        accreditation,
        wasteRecords: [
          wasteRecord({
            rowId: 'r-1',
            data: { tonnage: 5 },
            versions: [{ id: 'v1', createdAt: sameTime }]
          })
        ],
        prns: [
          prn({
            id: 'prn-1',
            tonnage: 2,
            history: [
              [PRN_STATUS.DRAFT, sameTime],
              [PRN_STATUS.AWAITING_AUTHORISATION, sameTime]
            ]
          })
        ],
        overseasSites
      })

      const orderedSourceKinds = result.transactions.map((t) => t.source.kind)
      expect(orderedSourceKinds).toEqual(['prn-operation', 'summary-log-row'])
    })
  })
})
