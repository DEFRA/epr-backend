import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'
import { computeRebuiltStream } from './compute-rebuilt-stream.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const { findSchemaForProcessingType } =
  await import('#domain/summary-logs/table-schemas/index.js')

const includedAt = (amount) => ({
  outcome: ROW_OUTCOME.INCLUDED,
  transactionAmount: amount
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
      availableAmount: 0
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
  })

  it('ignores non-submitted summary logs', () => {
    const result = computeRebuiltStream({
      accreditation,
      wasteRecords: [
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
      ],
      prns: [],
      overseasSites,
      summaryLogs: [
        {
          id: 'sl-1',
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          submittedAt: '2025-01-15T10:00:00.000Z'
        },
        { id: 'sl-draft', status: SUMMARY_LOG_STATUS.VALIDATED }
      ]
    })

    expect(result.events).toHaveLength(1)
    expect(result.amount).toBe(10)
  })

  it('excludes waste records not yet created at a submission point', () => {
    const result = computeRebuiltStream({
      accreditation,
      wasteRecords: [
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          type: 'received',
          data: { processingType: 'INPUT', tonnage: 50 },
          versions: [
            {
              summaryLog: { id: 'sl-2' },
              data: { processingType: 'INPUT', tonnage: 50 }
            }
          ],
          excludedFromWasteBalance: false
        }
      ],
      prns: [],
      overseasSites,
      summaryLogs: [
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
    })

    expect(result.events).toHaveLength(2)
    // First submission: record does not exist yet, creditTotal = 0
    expect(result.events[0].closingBalance).toEqual({
      amount: 0,
      availableAmount: 0
    })
    // Second submission: record appears, balance reflects it
    expect(result.amount).toBe(50)
  })

  it('reverses availableAmount for a pre-issue PRN cancellation', () => {
    const result = computeRebuiltStream({
      accreditation,
      wasteRecords: [
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
      ],
      prns: [
        {
          id: 'prn-1',
          tonnage: 25,
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
                status: PRN_STATUS.CANCELLED,
                at: new Date('2025-01-22T00:00:00.000Z')
              }
            ]
          }
        }
      ],
      overseasSites,
      summaryLogs: [
        {
          id: 'sl-1',
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          submittedAt: '2025-01-15T10:00:00.000Z'
        }
      ]
    })

    // PRN created then cancelled pre-issue: net zero effect on balance
    expect(result.amount).toBe(100)
    expect(result.availableAmount).toBe(100)
  })

  it('reverses both amount and availableAmount for a post-issue cancellation', () => {
    const result = computeRebuiltStream({
      accreditation,
      wasteRecords: [
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
      ],
      prns: [
        {
          id: 'prn-1',
          tonnage: 25,
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
              },
              {
                status: PRN_STATUS.AWAITING_CANCELLATION,
                at: new Date('2025-01-23T00:00:00.000Z')
              },
              {
                status: PRN_STATUS.CANCELLED,
                at: new Date('2025-01-24T00:00:00.000Z')
              }
            ]
          }
        }
      ],
      overseasSites,
      summaryLogs: [
        {
          id: 'sl-1',
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          submittedAt: '2025-01-15T10:00:00.000Z'
        }
      ]
    })

    // PRN created, issued, then cancelled: net zero effect
    expect(result.amount).toBe(100)
    expect(result.availableAmount).toBe(100)
  })
})
