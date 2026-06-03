import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import {
  STREAM_EVENT_KIND,
  streamEventInsertSchema
} from '../repository/stream-schema.js'
import {
  BACKFILL_ACTOR,
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
      wasteRecords: [],
      prns: [],
      overseasSites,
      summaryLogs: []
    })

    expect(result).toEqual({
      events: [],
      amount: 0,
      availableAmount: 0,
      backfilledActorCount: 0,
      backfilledActorCountByKind: {}
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
                status: PRN_STATUS.DELETED,
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

    // PRN created then removed pre-issue: net zero effect on balance
    expect(result.amount).toBe(100)
    expect(result.availableAmount).toBe(100)
  })

  it('records a zero-delta PRN_ACCEPTED event when a producer accepts', () => {
    const result = computeRebuiltStream({
      accreditation,
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
              },
              {
                status: PRN_STATUS.ACCEPTED,
                at: new Date('2025-01-23T00:00:00.000Z')
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

    const accepted =
      /** @type {import('../repository/stream-schema.js').StreamEventInsert} */ (
        result.events.find((e) => e.kind === STREAM_EVENT_KIND.PRN_ACCEPTED)
      )
    expect(accepted).toBeDefined()
    expect(accepted.openingBalance).toEqual(accepted.closingBalance)

    // Final balance unchanged by acceptance: created (-30 avail), issued (-30 amount)
    expect(result.amount).toBe(70)
    expect(result.availableAmount).toBe(70)
  })

  it('records a zero-delta PRN_REJECTED event when a producer rejects', () => {
    const result = computeRebuiltStream({
      accreditation,
      registrationId: 'reg-1',
      organisationId: 'org-1',
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
              },
              {
                status: PRN_STATUS.AWAITING_CANCELLATION,
                at: new Date('2025-01-23T00:00:00.000Z')
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

    const rejected =
      /** @type {import('../repository/stream-schema.js').StreamEventInsert} */ (
        result.events.find((e) => e.kind === STREAM_EVENT_KIND.PRN_REJECTED)
      )
    expect(rejected).toBeDefined()
    expect(rejected.openingBalance).toEqual(rejected.closingBalance)

    // Balance after created (-30 avail) + issued (-30 amount) + rejected (no-op)
    expect(result.amount).toBe(70)
    expect(result.availableAmount).toBe(70)
  })

  it('reverses both amount and availableAmount for a post-issue cancellation', () => {
    const result = computeRebuiltStream({
      accreditation,
      registrationId: 'reg-1',
      organisationId: 'org-1',
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

  describe('event linkage for stream seeding', () => {
    const registrationId = 'reg-1'
    const organisationId = 'org-1'

    const submittedRecord = (tonnage) => ({
      organisationId,
      registrationId,
      type: 'received',
      data: { processingType: 'INPUT', tonnage },
      versions: [
        {
          summaryLog: { id: 'sl-1' },
          data: { processingType: 'INPUT', tonnage }
        }
      ],
      excludedFromWasteBalance: false
    })

    const submittedLog = (submittedBy) => ({
      id: 'sl-1',
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      submittedAt: '2025-01-15T10:00:00.000Z',
      ...(submittedBy ? { submittedBy } : {})
    })

    it('attributes PRN events to the actor on the status history entry, reduced to id and name', () => {
      const signatory = {
        id: 'sig-7',
        name: 'Sam Signatory',
        position: 'Signatory'
      }
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [
          {
            id: 'prn-1',
            tonnage: 30,
            status: {
              history: [
                {
                  status: PRN_STATUS.DRAFT,
                  at: new Date('2025-01-20T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                },
                {
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
                  at: new Date('2025-01-21T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                },
                {
                  status: PRN_STATUS.AWAITING_ACCEPTANCE,
                  at: new Date('2025-01-22T00:00:00.000Z'),
                  by: signatory
                }
              ]
            }
          }
        ],
        overseasSites,
        summaryLogs: [submittedLog()]
      })

      const issued = result.events.find(
        (e) => e.kind === STREAM_EVENT_KIND.PRN_ISSUED
      )
      expect(issued?.createdBy).toEqual({ id: 'sig-7', name: 'Sam Signatory' })
    })

    it('attributes summary-log events to the supplied submitter', () => {
      const submitter = { id: 'usr-9', name: 'submitter@example.com' }
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [],
        overseasSites,
        summaryLogs: [submittedLog(submitter)]
      })

      expect(result.events[0].kind).toBe(
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      expect(result.events[0].createdBy).toEqual(submitter)
    })

    it('keeps an id-only submitter id-only, without fabricating a name', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [],
        overseasSites,
        summaryLogs: [submittedLog({ id: 'usr-9' })]
      })

      expect(result.events[0].createdBy).toEqual({ id: 'usr-9' })
      expect('name' in result.events[0].createdBy).toBe(false)
    })

    it('falls back to a system backfill actor when no submitter is supplied', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [],
        overseasSites,
        summaryLogs: [submittedLog()]
      })

      expect(result.events[0].createdBy).toEqual(BACKFILL_ACTOR)
    })

    it('sources registrationId and organisationId from parameters for a PRN-only accreditation', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId: 'reg-prn-only',
        organisationId: 'org-prn-only',
        wasteRecords: [],
        prns: [
          {
            id: 'prn-1',
            tonnage: 30,
            status: {
              history: [
                {
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
                  at: new Date('2025-01-21T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                }
              ]
            }
          }
        ],
        overseasSites,
        summaryLogs: []
      })

      expect(result.events).toHaveLength(1)
      expect(result.events[0].registrationId).toBe('reg-prn-only')
      expect(result.events[0].organisationId).toBe('org-prn-only')
      expect(result.events[0].accreditationId).toBe(accreditation.id)
    })

    it('orders a summary-log submission before a PRN event sharing its timestamp', () => {
      const sharedInstant = '2025-01-15T10:00:00.000Z'
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [
          {
            id: 'prn-1',
            tonnage: 30,
            status: {
              history: [
                {
                  status: PRN_STATUS.DRAFT,
                  at: new Date('2025-01-10T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                },
                {
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
                  at: new Date(sharedInstant),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                }
              ]
            }
          }
        ],
        overseasSites,
        summaryLogs: [submittedLog()]
      })

      expect(result.events[0].kind).toBe(
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )
      expect(result.events[1].kind).toBe(STREAM_EVENT_KIND.PRN_CREATED)
    })

    it('breaks PRN-vs-PRN timestamp ties by natural key', () => {
      const sharedInstant = new Date('2025-01-21T00:00:00.000Z')
      const createdAt = (id) => ({
        id,
        tonnage: 10,
        status: {
          history: [
            {
              status: PRN_STATUS.AWAITING_AUTHORISATION,
              at: sharedInstant,
              by: { id: 'rep-1', name: 'Rita Reprocessor' }
            }
          ]
        }
      })

      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [createdAt('prn-zulu'), createdAt('prn-alpha')],
        overseasSites,
        summaryLogs: []
      })

      expect(
        result.events.map((e) =>
          'prnId' in e.payload ? e.payload.prnId : undefined
        )
      ).toEqual(['prn-alpha', 'prn-zulu'])
    })

    it('throws on an impossible PRN status transition in history', () => {
      expect(() =>
        computeRebuiltStream({
          accreditation,
          registrationId,
          organisationId,
          wasteRecords: [],
          prns: [
            {
              id: 'prn-1',
              tonnage: 10,
              status: {
                history: [
                  {
                    status: PRN_STATUS.DRAFT,
                    at: new Date('2025-01-20T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  },
                  {
                    status: PRN_STATUS.AWAITING_AUTHORISATION,
                    at: new Date('2025-01-21T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  },
                  {
                    status: PRN_STATUS.AWAITING_CANCELLATION,
                    at: new Date('2025-01-22T00:00:00.000Z'),
                    by: { id: 'sig-1', name: 'Sam Signatory' }
                  }
                ]
              }
            }
          ],
          overseasSites,
          summaryLogs: []
        })
      ).toThrow(/prn-1/)
    })

    it('throws on a pre-issue cancellation that does not exist in the state machine', () => {
      expect(() =>
        computeRebuiltStream({
          accreditation,
          registrationId,
          organisationId,
          wasteRecords: [],
          prns: [
            {
              id: 'prn-1',
              tonnage: 10,
              status: {
                history: [
                  {
                    status: PRN_STATUS.DRAFT,
                    at: new Date('2025-01-20T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  },
                  {
                    status: PRN_STATUS.AWAITING_AUTHORISATION,
                    at: new Date('2025-01-21T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  },
                  {
                    status: PRN_STATUS.CANCELLED,
                    at: new Date('2025-01-22T00:00:00.000Z'),
                    by: { id: 'sig-1', name: 'Sam Signatory' }
                  }
                ]
              }
            }
          ],
          overseasSites,
          summaryLogs: []
        })
      ).toThrow(/prn-1/)
    })

    it('skips a valid transition that maps to no balance event without throwing', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [
          {
            id: 'prn-1',
            tonnage: 10,
            status: {
              history: [
                {
                  status: PRN_STATUS.DRAFT,
                  at: new Date('2025-01-20T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                },
                {
                  status: PRN_STATUS.DISCARDED,
                  at: new Date('2025-01-21T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                }
              ]
            }
          }
        ],
        overseasSites,
        summaryLogs: []
      })

      expect(result.events).toHaveLength(0)
    })

    it('collapses a duplicate same-state history entry to a single event', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId: 'reg-1',
        organisationId: 'org-1',
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
                },
                {
                  status: PRN_STATUS.AWAITING_ACCEPTANCE,
                  at: new Date('2025-01-23T00:00:00.000Z')
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

      const issued = result.events.filter(
        (e) => e.kind === STREAM_EVENT_KIND.PRN_ISSUED
      )
      expect(issued).toHaveLength(1)
      expect(result.amount).toBe(70)
      expect(result.availableAmount).toBe(70)
    })

    it('collapses a duplicate awaiting_authorisation entry to a single PRN_CREATED', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId: 'reg-1',
        organisationId: 'org-1',
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
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
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

      const created = result.events.filter(
        (e) => e.kind === STREAM_EVENT_KIND.PRN_CREATED
      )
      expect(created).toHaveLength(1)
      expect(result.amount).toBe(100)
      expect(result.availableAmount).toBe(70)
    })

    it('throws when a history entry transitions from an unrecognised status', () => {
      expect(() =>
        computeRebuiltStream({
          accreditation,
          registrationId,
          organisationId,
          wasteRecords: [],
          prns: [
            {
              id: 'prn-1',
              tonnage: 10,
              status: {
                history: [
                  {
                    status: 'not-a-real-status',
                    at: new Date('2025-01-20T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  },
                  {
                    status: PRN_STATUS.DRAFT,
                    at: new Date('2025-01-21T00:00:00.000Z'),
                    by: { id: 'rep-1', name: 'Rita Reprocessor' }
                  }
                ]
              }
            }
          ],
          overseasSites,
          summaryLogs: []
        })
      ).toThrow(/prn-1/)
    })

    it('breaks summary-log timestamp ties by natural key', () => {
      const sharedInstant = '2025-01-15T10:00:00.000Z'
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [],
        overseasSites,
        summaryLogs: [
          {
            id: 'sl-zulu',
            status: SUMMARY_LOG_STATUS.SUBMITTED,
            submittedAt: sharedInstant
          },
          {
            id: 'sl-alpha',
            status: SUMMARY_LOG_STATUS.SUBMITTED,
            submittedAt: sharedInstant
          }
        ]
      })

      expect(
        result.events.map((e) =>
          'summaryLogId' in e.payload ? e.payload.summaryLogId : undefined
        )
      ).toEqual(['sl-alpha', 'sl-zulu'])
    })

    it('emits events that satisfy the stream insert schema', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [submittedRecord(100)],
        prns: [
          {
            id: 'prn-1',
            tonnage: 30,
            status: {
              history: [
                {
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
                  at: new Date('2025-01-21T00:00:00.000Z'),
                  by: { id: 'rep-1', name: 'Rita Reprocessor' }
                }
              ]
            }
          }
        ],
        overseasSites,
        summaryLogs: [submittedLog()]
      })

      expect(result.events).toHaveLength(2)
      for (const event of result.events) {
        expect(streamEventInsertSchema.validate(event).error).toBeUndefined()
      }
    })
  })

  describe('backfilled actor count', () => {
    const registrationId = 'reg-1'
    const organisationId = 'org-1'

    const submittedLog = (id, submittedBy) => ({
      id,
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      submittedAt: '2025-01-15T10:00:00.000Z',
      ...(submittedBy ? { submittedBy } : {})
    })

    const createdPrn = (id, by) => ({
      id,
      tonnage: 10,
      status: {
        history: [
          {
            status: PRN_STATUS.AWAITING_AUTHORISATION,
            at: new Date('2025-01-21T00:00:00.000Z'),
            ...(by ? { by } : {})
          }
        ]
      }
    })

    it('reports zero when every event carries a real actor', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [createdPrn('prn-1', { id: 'rep-1', name: 'Rita Reprocessor' })],
        overseasSites,
        summaryLogs: [
          submittedLog('sl-1', { id: 'usr-9', name: 'submitter@example.com' })
        ]
      })

      expect(result.backfilledActorCount).toBe(0)
      expect(result.backfilledActorCountByKind).toEqual({})
    })

    it('counts a summary-log event with no submitter', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [],
        overseasSites,
        summaryLogs: [submittedLog('sl-1')]
      })

      expect(result.backfilledActorCount).toBe(1)
      expect(result.backfilledActorCountByKind).toEqual({
        [STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: 1
      })
    })

    it('counts a PRN event whose history entry has no actor', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [createdPrn('prn-1')],
        overseasSites,
        summaryLogs: []
      })

      expect(result.backfilledActorCount).toBe(1)
      expect(result.backfilledActorCountByKind).toEqual({
        [STREAM_EVENT_KIND.PRN_CREATED]: 1
      })
    })

    it('breaks the backfilled count down by event type', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [createdPrn('prn-1')],
        overseasSites,
        summaryLogs: [submittedLog('sl-1')]
      })

      expect(result.backfilledActorCount).toBe(2)
      expect(result.backfilledActorCountByKind).toEqual({
        [STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: 1,
        [STREAM_EVENT_KIND.PRN_CREATED]: 1
      })
    })

    it('keys each transition in one PRN history by its own event type', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [
          {
            id: 'prn-1',
            tonnage: 10,
            status: {
              history: [
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
        ],
        overseasSites,
        summaryLogs: []
      })

      expect(result.backfilledActorCount).toBe(2)
      expect(result.backfilledActorCountByKind).toEqual({
        [STREAM_EVENT_KIND.PRN_CREATED]: 1,
        [STREAM_EVENT_KIND.PRN_ISSUED]: 1
      })
    })

    it('tallies repeated backfills of the same event type', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [createdPrn('prn-1'), createdPrn('prn-2')],
        overseasSites,
        summaryLogs: []
      })

      expect(result.backfilledActorCount).toBe(2)
      expect(result.backfilledActorCountByKind).toEqual({
        [STREAM_EVENT_KIND.PRN_CREATED]: 2
      })
    })

    it('reports zero for an empty stream', () => {
      const result = computeRebuiltStream({
        accreditation,
        registrationId,
        organisationId,
        wasteRecords: [],
        prns: [],
        overseasSites,
        summaryLogs: []
      })

      expect(result.backfilledActorCount).toBe(0)
      expect(result.backfilledActorCountByKind).toEqual({})
    })
  })
})
