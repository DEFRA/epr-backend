import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import {
  reconstructDataAtSubmission,
  replayStream,
  buildChronologicalEvents,
  computeRebuiltStream
} from './compute-rebuilt-stream.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const { findSchemaForProcessingType } =
  await import('#domain/summary-logs/table-schemas/index.js')

const includedAt = (amount) => ({
  outcome: ROW_OUTCOME.INCLUDED,
  transactionAmount: amount
})

describe('reconstructDataAtSubmission', () => {
  it('returns null when no versions match the seen summary logs', () => {
    const versions = [{ summaryLog: { id: 'sl-2' }, data: { tonnage: 10 } }]

    const result = reconstructDataAtSubmission(versions, new Set(['sl-1']))

    expect(result).toBeNull()
  })

  it('returns the created version data when its summary log has been seen', () => {
    const versions = [
      {
        status: 'created',
        summaryLog: { id: 'sl-1' },
        data: { tonnage: 10, material: 'plastic', processingType: 'INPUT' }
      }
    ]

    const result = reconstructDataAtSubmission(versions, new Set(['sl-1']))

    expect(result).toEqual({
      tonnage: 10,
      material: 'plastic',
      processingType: 'INPUT'
    })
  })

  it('layers updated version data onto the created version', () => {
    const versions = [
      {
        status: 'created',
        summaryLog: { id: 'sl-1' },
        data: { tonnage: 10, material: 'plastic', processingType: 'INPUT' }
      },
      {
        status: 'updated',
        summaryLog: { id: 'sl-2' },
        data: { tonnage: 15 }
      }
    ]

    const result = reconstructDataAtSubmission(
      versions,
      new Set(['sl-1', 'sl-2'])
    )

    expect(result).toEqual({
      tonnage: 15,
      material: 'plastic',
      processingType: 'INPUT'
    })
  })

  it('stops at the latest version whose summary log has been seen', () => {
    const versions = [
      {
        status: 'created',
        summaryLog: { id: 'sl-1' },
        data: { tonnage: 10, material: 'plastic', processingType: 'INPUT' }
      },
      {
        status: 'updated',
        summaryLog: { id: 'sl-2' },
        data: { tonnage: 15 }
      },
      {
        status: 'updated',
        summaryLog: { id: 'sl-3' },
        data: { tonnage: 20 }
      }
    ]

    const result = reconstructDataAtSubmission(
      versions,
      new Set(['sl-1', 'sl-2'])
    )

    expect(result).toEqual({
      tonnage: 15,
      material: 'plastic',
      processingType: 'INPUT'
    })
  })
})

describe('replayStream', () => {
  it('returns empty array when given no events', () => {
    const result = replayStream([])

    expect(result).toEqual([])
  })

  it('replays a single summary-log-submitted event from zero balance', () => {
    const events = [
      {
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'sl-1', creditTotal: 100 },
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1'
      }
    ]

    const result = replayStream(events)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      number: 1,
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      openingBalance: { amount: 0, availableAmount: 0 },
      closingBalance: { amount: 100, availableAmount: 100 }
    })
  })

  it('threads balances across multiple events', () => {
    const events = [
      {
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'sl-1', creditTotal: 100 },
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1'
      },
      {
        timestamp: new Date('2025-01-02T00:00:00.000Z'),
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 30 },
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1'
      }
    ]

    const result = replayStream(events)

    expect(result).toHaveLength(2)
    expect(result[0].closingBalance).toEqual({
      amount: 100,
      availableAmount: 100
    })
    expect(result[1]).toMatchObject({
      number: 2,
      openingBalance: { amount: 100, availableAmount: 100 },
      closingBalance: { amount: 100, availableAmount: 70 }
    })
  })

  it('tracks previousCreditTotal across summary-log events', () => {
    const events = [
      {
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'sl-1', creditTotal: 100 },
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1'
      },
      {
        timestamp: new Date('2025-01-02T00:00:00.000Z'),
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { summaryLogId: 'sl-2', creditTotal: 150 },
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1'
      }
    ]

    const result = replayStream(events)

    expect(result[0].closingBalance).toEqual({
      amount: 100,
      availableAmount: 100
    })
    expect(result[1]).toMatchObject({
      openingBalance: { amount: 100, availableAmount: 100 },
      closingBalance: { amount: 150, availableAmount: 150 }
    })
  })
})

describe('buildChronologicalEvents', () => {
  const accreditation = { id: 'acc-1' }
  const overseasSites = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findSchemaForProcessingType).mockReturnValue(
      /** @type {any} */ ({
        classifyForWasteBalance: (data) =>
          data.tonnage === undefined
            ? { outcome: ROW_OUTCOME.EXCLUDED, transactionAmount: 0 }
            : includedAt(data.tonnage)
      })
    )
  })

  it('returns empty array when no summary logs and no PRNs', () => {
    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords: [],
      prns: [],
      overseasSites,
      summaryLogs: []
    })

    expect(result).toEqual([])
  })

  it('emits a summary-log-submitted event with creditTotal from waste records', () => {
    const summaryLogs = [
      {
        id: 'sl-1',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-15T10:00:00.000Z'
      }
    ]
    const wasteRecords = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 40 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 40 }
          }
        ],
        excludedFromWasteBalance: false
      },
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 60 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 60 }
          }
        ],
        excludedFromWasteBalance: false
      }
    ]

    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords,
      prns: [],
      overseasSites,
      summaryLogs
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId: 'sl-1', creditTotal: 100 },
      timestamp: new Date('2025-01-15T10:00:00.000Z')
    })
  })

  it('accumulates creditTotal across summary log submissions using version history', () => {
    const summaryLogs = [
      {
        id: 'sl-1',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-15T10:00:00.000Z'
      },
      {
        id: 'sl-2',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-02-15T10:00:00.000Z'
      }
    ]
    const wasteRecords = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 50 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 40 }
          },
          { summaryLog: { id: 'sl-2' }, data: { tonnage: 50 } }
        ],
        excludedFromWasteBalance: false
      }
    ]

    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords,
      prns: [],
      overseasSites,
      summaryLogs
    })

    expect(result).toHaveLength(2)
    expect(result[0].payload).toEqual({ summaryLogId: 'sl-1', creditTotal: 40 })
    expect(result[1].payload).toEqual({ summaryLogId: 'sl-2', creditTotal: 50 })
  })

  it('filters out non-submitted summary logs', () => {
    const summaryLogs = [
      {
        id: 'sl-1',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-15T10:00:00.000Z'
      },
      {
        id: 'sl-draft',
        status: SUMMARY_LOG_STATUS.VALIDATED
      }
    ]
    const wasteRecords = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 10 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 10 }
          }
        ],
        excludedFromWasteBalance: false
      }
    ]

    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords,
      prns: [],
      overseasSites,
      summaryLogs
    })

    expect(result).toHaveLength(1)
    expect(result[0].payload.summaryLogId).toBe('sl-1')
  })

  it('emits PRN events from status history transitions', () => {
    const prns = [
      {
        id: 'prn-1',
        tonnage: 25,
        status: {
          history: [
            {
              status: PRN_STATUS.DRAFT,
              at: new Date('2025-01-10T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              at: new Date('2025-01-11T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_ACCEPTANCE,
              at: new Date('2025-01-12T00:00:00.000Z')
            }
          ]
        }
      }
    ]

    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords: [],
      prns,
      overseasSites,
      summaryLogs: []
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      kind: STREAM_EVENT_KIND.PRN_CREATED,
      payload: { prnId: 'prn-1', amount: 25 },
      timestamp: new Date('2025-01-11T00:00:00.000Z')
    })
    expect(result[1]).toMatchObject({
      kind: STREAM_EVENT_KIND.PRN_ISSUED,
      payload: { prnId: 'prn-1', amount: 25 },
      timestamp: new Date('2025-01-12T00:00:00.000Z')
    })
  })

  it('skips PRN transitions that do not produce stream events', () => {
    const prns = [
      {
        id: 'prn-1',
        tonnage: 25,
        status: {
          history: [
            {
              status: PRN_STATUS.DRAFT,
              at: new Date('2025-01-10T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              at: new Date('2025-01-11T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.ACCEPTED,
              at: new Date('2025-01-13T00:00:00.000Z')
            }
          ]
        }
      }
    ]

    const result = buildChronologicalEvents({
      accreditation,
      wasteRecords: [],
      prns,
      overseasSites,
      summaryLogs: []
    })

    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
  })
})

describe('computeRebuiltStream', () => {
  const accreditation = { id: 'acc-1' }
  const overseasSites = {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findSchemaForProcessingType).mockReturnValue(
      /** @type {any} */ ({
        classifyForWasteBalance: (data) =>
          data.tonnage === undefined
            ? { outcome: ROW_OUTCOME.EXCLUDED, transactionAmount: 0 }
            : includedAt(data.tonnage)
      })
    )
  })

  it('returns zero totals and empty events when given no inputs', () => {
    const result = computeRebuiltStream({
      accreditation,
      wasteRecords: [],
      prns: [],
      overseasSites,
      summaryLogs: []
    })

    expect(result).toEqual({
      events: [],
      amount: 0,
      availableAmount: 0,
      wasteRecordContribution: 0,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
  })

  it('produces events sorted chronologically and derives correct totals', () => {
    const summaryLogs = [
      {
        id: 'sl-1',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-15T10:00:00.000Z'
      }
    ]
    const wasteRecords = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 100 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 100 }
          }
        ],
        excludedFromWasteBalance: false
      }
    ]
    const prns = [
      {
        id: 'prn-1',
        tonnage: 30,
        status: {
          history: [
            {
              status: PRN_STATUS.DRAFT,
              at: new Date('2025-01-20T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              at: new Date('2025-01-21T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_ACCEPTANCE,
              at: new Date('2025-01-22T00:00:00.000Z')
            }
          ]
        }
      }
    ]

    const result = computeRebuiltStream({
      accreditation,
      wasteRecords,
      prns,
      overseasSites,
      summaryLogs
    })

    expect(result.events).toHaveLength(3)
    expect(result.events[0].kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(result.events[1].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
    expect(result.events[2].kind).toBe(STREAM_EVENT_KIND.PRN_ISSUED)

    expect(result.amount).toBe(70)
    expect(result.availableAmount).toBe(70)
    expect(result.wasteRecordContribution).toBe(100)
    expect(result.prnAmountContribution).toBe(-30)
    expect(result.prnAvailableAmountContribution).toBe(-30)
  })

  it('handles multiple summary logs with version history and interleaved PRNs', () => {
    const summaryLogs = [
      {
        id: 'sl-1',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-10T00:00:00.000Z'
      },
      {
        id: 'sl-2',
        status: SUMMARY_LOG_STATUS.SUBMITTED,
        submittedAt: '2025-01-20T00:00:00.000Z'
      }
    ]
    const wasteRecords = [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: 'received',
        data: { processingType: 'INPUT', tonnage: 60 },
        versions: [
          {
            summaryLog: { id: 'sl-1' },
            data: { processingType: 'INPUT', tonnage: 40 }
          },
          { summaryLog: { id: 'sl-2' }, data: { tonnage: 60 } }
        ],
        excludedFromWasteBalance: false
      }
    ]
    const prns = [
      {
        id: 'prn-1',
        tonnage: 10,
        status: {
          history: [
            {
              status: PRN_STATUS.DRAFT,
              at: new Date('2025-01-14T00:00:00.000Z')
            },
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              at: new Date('2025-01-15T00:00:00.000Z')
            }
          ]
        }
      }
    ]

    const result = computeRebuiltStream({
      accreditation,
      wasteRecords,
      prns,
      overseasSites,
      summaryLogs
    })

    expect(result.events).toHaveLength(3)
    // Chronological: sl-1 (Jan 10), prn-created (Jan 15), sl-2 (Jan 20)
    expect(result.events[0].kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(
      /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
        result.events[0].payload
      ).creditTotal
    ).toBe(40)
    expect(result.events[1].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
    expect(result.events[2].kind).toBe(STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
    expect(
      /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
        result.events[2].payload
      ).creditTotal
    ).toBe(60)

    // Final balance: 60 (waste) - 10 (PRN created, availableAmount only)
    expect(result.amount).toBe(60)
    expect(result.availableAmount).toBe(50)
    expect(result.wasteRecordContribution).toBe(60)
    expect(result.prnAmountContribution).toBe(0)
    expect(result.prnAvailableAmountContribution).toBe(-10)
  })
})
