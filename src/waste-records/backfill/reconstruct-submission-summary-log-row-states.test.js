import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import { reconstructSubmissionSummaryLogRowStates } from './reconstruct-submission-summary-log-row-states.js'

const accreditation = { id: 'acc-1' }
/** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
const overseasSites = ORS_VALIDATION_DISABLED

const submittedLog = (id, submittedAt) => ({
  id,
  status: SUMMARY_LOG_STATUS.SUBMITTED,
  submittedAt
})

const receivedRecord = (rowId, versions) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: versions.at(-1).data,
  versions
})

describe('reconstructSubmissionSummaryLogRowStates', () => {
  it('returns no upserts when there are no summary logs', () => {
    expect(
      reconstructSubmissionSummaryLogRowStates({
        wasteRecords: [],
        summaryLogs: [],
        accreditation,
        overseasSites
      })
    ).toEqual([])
  })

  it('emits one upsert descriptor per submitted log, in submission order', () => {
    const summaryLogs = [
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z'),
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts.map((u) => u.summaryLogId)).toEqual(['sl-1', 'sl-2'])
  })

  it('breaks submittedAt ties by id so attribution is deterministic', () => {
    const summaryLogs = [
      submittedLog('sl-b', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-a', '2025-01-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-b' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts.map((u) => u.summaryLogId)).toEqual(['sl-a', 'sl-b'])
    expect(upserts[0].entries).toEqual([])
    expect(upserts[1].entries.map((e) => e.rowId)).toEqual(['row-1'])
  })

  it('skips a row at submissions before it was first created', () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-late', [
        { summaryLog: { id: 'sl-2' }, data: { supplierName: 'Beta' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts[0]).toEqual({
      summaryLogId: 'sl-1',
      entries: [],
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    expect(upserts[1].entries.map((e) => e.rowId)).toEqual(['row-late'])
  })

  it('carries each submission provenance for the backfilled event', () => {
    const summaryLogs = [
      {
        ...submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
        submittedBy: { id: 'user-1', name: 'Ada' }
      },
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(
      upserts.map(({ summaryLogId, submittedAt, submittedBy }) => ({
        summaryLogId,
        submittedAt,
        submittedBy
      }))
    ).toEqual([
      {
        summaryLogId: 'sl-1',
        submittedAt: '2025-01-01T00:00:00.000Z',
        submittedBy: { id: 'user-1', name: 'Ada' }
      },
      {
        summaryLogId: 'sl-2',
        submittedAt: '2025-02-01T00:00:00.000Z',
        submittedBy: undefined
      }
    ])
  })

  it('folds partial update versions forward to reconstruct as-of-submission data', () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        {
          summaryLog: { id: 'sl-1' },
          data: { supplierName: 'Acme', tonnage: 10 }
        },
        { summaryLog: { id: 'sl-2' }, data: { tonnage: 20 } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts[0].entries[0].data).toEqual({
      supplierName: 'Acme',
      tonnage: 10
    })
    expect(upserts[1].entries[0].data).toEqual({
      supplierName: 'Acme',
      tonnage: 20
    })
  })

  it('carries an unchanged row forward into later submissions (membership grows)', () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts[0].summaryLogId).toBe('sl-1')
    expect(upserts[0].entries.map((e) => e.rowId)).toEqual(['row-1'])
    expect(upserts[1].summaryLogId).toBe('sl-2')
    expect(upserts[1].entries.map((e) => e.rowId)).toEqual(['row-1'])
  })

  it('produces entries in the shape upsertSummaryLogRowStates consumes', () => {
    const summaryLogs = [submittedLog('sl-1', '2025-01-01T00:00:00.000Z')]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const [{ entries }] = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(entries[0]).toEqual({
      rowId: 'row-1',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      data: { supplierName: 'Acme' },
      classification: {
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [],
        transactionAmount: 0
      }
    })
  })

  it('coerces stored tonnages and weights to two decimal places in reconstructed entries', () => {
    const summaryLogs = [submittedLog('sl-1', '2025-01-01T00:00:00.000Z')]
    const wasteRecords = [
      receivedRecord('row-1', [
        {
          summaryLog: { id: 'sl-1' },
          data: {
            supplierName: 'Acme',
            TONNAGE_RECEIVED_FOR_RECYCLING: 1.005,
            NET_WEIGHT: 7.536,
            TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 3.995
          }
        }
      ])
    ]

    const [{ entries }] = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(entries[0].data).toEqual({
      supplierName: 'Acme',
      TONNAGE_RECEIVED_FOR_RECYCLING: 1.01,
      NET_WEIGHT: 7.54,
      TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 4
    })
  })

  it('ignores summary logs that are not submitted', () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      {
        id: 'sl-draft',
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        submittedAt: '2025-03-01T00:00:00.000Z'
      }
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const upserts = reconstructSubmissionSummaryLogRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts.map((u) => u.summaryLogId)).toEqual(['sl-1'])
  })
})
