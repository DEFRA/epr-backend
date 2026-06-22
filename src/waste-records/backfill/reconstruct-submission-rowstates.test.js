import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

import { reconstructSubmissionRowStates } from './reconstruct-submission-rowstates.js'

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

describe('reconstructSubmissionRowStates', () => {
  it('returns no upserts when there are no summary logs', () => {
    expect(
      reconstructSubmissionRowStates({
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

    const upserts = reconstructSubmissionRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts.map((u) => u.summaryLogId)).toEqual(['sl-1', 'sl-2'])
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

    const upserts = reconstructSubmissionRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts[0]).toEqual({ summaryLogId: 'sl-1', entries: [] })
    expect(upserts[1].entries.map((e) => e.rowId)).toEqual(['row-late'])
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

    const upserts = reconstructSubmissionRowStates({
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

    const upserts = reconstructSubmissionRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts[0].entries.map((e) => e.rowId)).toEqual(['row-1'])
    expect(upserts[1].entries.map((e) => e.rowId)).toEqual(['row-1'])
  })

  it('produces entries in the shape upsertRowStates consumes', () => {
    const summaryLogs = [submittedLog('sl-1', '2025-01-01T00:00:00.000Z')]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]

    const [{ entries }] = reconstructSubmissionRowStates({
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

    const upserts = reconstructSubmissionRowStates({
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites
    })

    expect(upserts.map((u) => u.summaryLogId)).toEqual(['sl-1'])
  })
})
