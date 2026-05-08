import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { computeRebuiltTotals } from './compute-rebuilt-totals.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const { findSchemaForProcessingType } =
  await import('#domain/summary-logs/table-schemas/index.js')

const includedAt = (amount) => ({
  outcome: ROW_OUTCOME.INCLUDED,
  transactionAmount: amount
})

const wasteRecord = ({
  rowId,
  type = 'received',
  processingType = 'REPROCESSOR_INPUT',
  excludedFromWasteBalance = false,
  data = {}
}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId,
  type,
  data: { processingType, ...data },
  versions: [{ id: 'v1', createdAt: '2025-01-01T00:00:00.000Z' }],
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
  history = [
    [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
    [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z']
  ]
}) => ({
  id,
  tonnage,
  status: { history: prnHistory(...history) }
})

const accreditation = { id: 'acc-1' }
const overseasSites = {}

describe('computeRebuiltTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSchemaForProcessingType.mockReturnValue({
      classifyForWasteBalance: (data) =>
        data.tonnage === undefined
          ? { outcome: ROW_OUTCOME.EXCLUDED, transactionAmount: 0 }
          : includedAt(data.tonnage)
    })
  })

  it('returns zero totals when no records or PRNs', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({ amount: 0, availableAmount: 0 })
  })

  it('credits both balance fields by the sum of waste-record target amounts', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [
        wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } }),
        wasteRecord({ rowId: 'r-2', data: { tonnage: 6 } })
      ],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({ amount: 10, availableAmount: 10 })
  })

  it('skips records whose schema returns a non-INCLUDED outcome', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [
        wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } }),
        wasteRecord({ rowId: 'r-2', data: {} })
      ],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({ amount: 4, availableAmount: 4 })
  })

  it('skips records flagged excludedFromWasteBalance', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 0, availableAmount: 0 })
  })

  it('skips records whose schema has no classifyForWasteBalance', () => {
    findSchemaForProcessingType.mockReturnValueOnce({
      classifyForWasteBalance: null
    })

    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } })],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({ amount: 0, availableAmount: 0 })
  })

  it('debits availableAmount only when a PRN is in AWAITING_AUTHORISATION', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
      prns: [prn({ id: 'prn-1', tonnage: 3 })],
      overseasSites
    })

    expect(result).toEqual({ amount: 10, availableAmount: 7 })
  })

  it('debits both fields when a PRN is in AWAITING_ACCEPTANCE', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 7, availableAmount: 7 })
  })

  it('keeps the issued debit through ACCEPTED', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 6, availableAmount: 6 })
  })

  it('reverses pre-issue PRN cancellations to net zero', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 10, availableAmount: 10 })
  })

  it('reverses pre-issue deletion to net zero', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 10, availableAmount: 10 })
  })

  it('reverses post-issue cancellation to net zero on both fields', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 10, availableAmount: 10 })
  })

  it('emits no balance effect for DRAFT-only or DISCARDED PRNs', () => {
    const result = computeRebuiltTotals({
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

    expect(result).toEqual({ amount: 10, availableAmount: 10 })
  })

  it('uses exact decimal arithmetic for the running totals', () => {
    const result = computeRebuiltTotals({
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

  it('combines waste-record credits and PRN debits across lifecycle states', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [
        wasteRecord({ rowId: 'r-1', data: { tonnage: 12 } }),
        wasteRecord({ rowId: 'r-2', data: { tonnage: 8 } }),
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
    })

    // 20t credit; issued PRN debits both fields by 5t; pending PRN debits
    // available by 2t; cancelled-pre-issue nets to zero on both fields
    expect(result).toEqual({ amount: 15, availableAmount: 13 })
  })
})
