import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

import { reconcileRegistration } from './reconcile-registration.js'

/** @import { WasteRecord } from '#domain/waste-records/model.js' */

const ledger = {
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

/**
 * Reconcile with the committed summary-log id set defaulting to just the head —
 * the single-submission case, where the carry-forward baseline coincides with a
 * changed-at-head baseline. Tests exercising restated-unchanged rows across
 * earlier submissions pass an explicit `committedSummaryLogIds`.
 */
const reconcile = (input) =>
  reconcileRegistration({
    ...ledger,
    committedSummaryLogIds: new Set(input.head === null ? [] : [input.head]),
    ...input
  })

const includedWasteRecordState = (rowId, transactionAmount, reasons = []) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons,
    transactionAmount
  }
})

const excludedWasteRecordState = (rowId) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  classification: {
    outcome: ROW_OUTCOME.EXCLUDED,
    reasons: [],
    transactionAmount: 0
  }
})

/**
 * A legacy waste-record committed at `head` that classifies EXCLUDED.
 *
 * @param {string} rowId
 * @param {string} head
 * @returns {WasteRecord}
 */
const committedRecord = (rowId, head) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  excludedFromWasteBalance: true,
  versions: [
    {
      id: `${rowId}-v1`,
      createdAt: '2026-02-01T00:00:00.000Z',
      status: VERSION_STATUS.CREATED,
      summaryLog: { id: head, uri: `s3://summary-logs/${head}` },
      data: { ROW_ID: rowId }
    }
  ]
})

describe('reconcileRegistration', () => {
  it('treats a ledger with no committed submission as clean and uncovered', () => {
    const result = reconcile({
      head: null,
      eventCreditTotal: null,
      wasteRecordStates: [],
      wasteRecords: [],
      accreditation: null,
      overseasSites: {}
    })

    expect(result).toMatchObject({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      head: null,
      hasCommittedSubmission: false,
      hasWasteRecordStateData: false,
      missingRows: [],
      extraRows: [],
      classificationDivergences: [],
      isClean: true
    })
  })

  it('reconciles a covered head whose waste record states match the committed rows and event total', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 0,
      wasteRecordStates: [
        excludedWasteRecordState('row-1'),
        excludedWasteRecordState('row-2')
      ],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result).toMatchObject({
      head: 'log-2',
      hasCommittedSubmission: true,
      hasWasteRecordStateData: true,
      wasteRecordStateCount: 2,
      committedRowCount: 2,
      creditTotal: { wasteRecordStates: 0, event: 0, drift: 0 },
      missingRows: [],
      extraRows: [],
      classificationDivergences: [],
      isClean: true
    })
  })

  it('flags a committed head with no waste record state data as an uncovered backfill gap', () => {
    const result = reconcile({
      head: 'log-1',
      eventCreditTotal: 10,
      wasteRecordStates: [],
      wasteRecords: [committedRecord('row-1', 'log-1')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.hasCommittedSubmission).toBe(true)
    expect(result.hasWasteRecordStateData).toBe(false)
    expect(result.isClean).toBe(false)
  })

  it('reports a committed-at-head row absent from the waste record states as missing', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 10,
      wasteRecordStates: [includedWasteRecordState('row-1', 10)],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.missingRows).toEqual([
      { rowId: 'row-2', wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }
    ])
    expect(result.isClean).toBe(false)
  })

  it('reports a waste record state not committed at the head in legacy as extra', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 10,
      wasteRecordStates: [
        includedWasteRecordState('row-1', 10),
        includedWasteRecordState('row-9', 0)
      ],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.extraRows).toEqual([
      { rowId: 'row-9', wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }
    ])
    expect(result.isClean).toBe(false)
  })

  it('treats a row committed at an earlier submission and restated unchanged at the head as committed, not extra', () => {
    const result = reconcile({
      head: 'log-2',
      committedSummaryLogIds: new Set(['log-1', 'log-2']),
      eventCreditTotal: 10,
      wasteRecordStates: [includedWasteRecordState('row-1', 10)],
      wasteRecords: [committedRecord('row-1', 'log-1')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.committedRowCount).toBe(1)
    expect(result.missingRows).toEqual([])
    expect(result.extraRows).toEqual([])
    expect(result.creditTotal).toEqual({
      wasteRecordStates: 10,
      event: 10,
      drift: 0
    })
    expect(result.isClean).toBe(true)
  })

  it('reports creditTotal drift when the waste record states do not sum to the event total', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 30,
      wasteRecordStates: [
        includedWasteRecordState('row-1', 10),
        includedWasteRecordState('row-2', 5)
      ],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.creditTotal).toEqual({
      wasteRecordStates: 15,
      event: 30,
      drift: -15
    })
    expect(result.isClean).toBe(false)
  })

  it('reports a row whose waste record state outcome disagrees with the legacy reader as a classification divergence, carrying its reasons', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 10,
      wasteRecordStates: [
        includedWasteRecordState('row-1', 10, [{ code: 'ORS_NOT_APPROVED' }])
      ],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.classificationDivergences).toEqual([
      {
        rowId: 'row-1',
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
        wasteRecordStateIncluded: true,
        legacyIncluded: false,
        reasons: [{ code: 'ORS_NOT_APPROVED' }]
      }
    ])
  })

  it('keeps classification divergence out of the cleanliness verdict (context-sensitive signal)', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 10,
      wasteRecordStates: [includedWasteRecordState('row-1', 10)],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.classificationDivergences).toHaveLength(1)
    expect(result.isClean).toBe(true)
  })

  it('excludes non-included waste record states from the waste record state credit total', () => {
    const result = reconcile({
      head: 'log-2',
      eventCreditTotal: 10,
      wasteRecordStates: [
        includedWasteRecordState('row-1', 10),
        excludedWasteRecordState('row-2')
      ],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.creditTotal).toEqual({
      wasteRecordStates: 10,
      event: 10,
      drift: 0
    })
  })
})
