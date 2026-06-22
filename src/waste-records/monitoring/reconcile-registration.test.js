import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

import { reconcileRegistration } from './reconcile-registration.js'

/** @import { WasteRecord } from '#domain/waste-records/model.js' */

const partition = {
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const includedRowState = (rowId, transactionAmount) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount
  }
})

const excludedRowState = (rowId) => ({
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
  it('treats a partition with no committed submission as clean and uncovered', () => {
    const result = reconcileRegistration({
      ...partition,
      head: null,
      eventCreditTotal: null,
      rowStates: [],
      wasteRecords: [],
      accreditation: null,
      overseasSites: {}
    })

    expect(result).toMatchObject({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      head: null,
      hasCommittedSubmission: false,
      hasRowStateData: false,
      missingRows: [],
      extraRows: [],
      classificationDivergences: [],
      isClean: true
    })
  })

  it('reconciles a covered head whose row-states match the committed rows and event total', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 0,
      rowStates: [excludedRowState('row-1'), excludedRowState('row-2')],
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
      hasRowStateData: true,
      rowStateCount: 2,
      committedRowCount: 2,
      creditTotal: { rowStates: 0, event: 0, drift: 0 },
      missingRows: [],
      extraRows: [],
      classificationDivergences: [],
      isClean: true
    })
  })

  it('flags a committed head with no row-state data as an uncovered backfill gap', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-1',
      eventCreditTotal: 10,
      rowStates: [],
      wasteRecords: [committedRecord('row-1', 'log-1')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.hasCommittedSubmission).toBe(true)
    expect(result.hasRowStateData).toBe(false)
    expect(result.isClean).toBe(false)
  })

  it('reports a committed-at-head row absent from the row-states as missing', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 10,
      rowStates: [includedRowState('row-1', 10)],
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

  it('reports a row-state row not committed at the head in legacy as extra', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 10,
      rowStates: [includedRowState('row-1', 10), includedRowState('row-9', 0)],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.extraRows).toEqual([
      { rowId: 'row-9', wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }
    ])
    expect(result.isClean).toBe(false)
  })

  it('reports creditTotal drift when the row-states do not sum to the event total', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 30,
      rowStates: [includedRowState('row-1', 10), includedRowState('row-2', 5)],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.creditTotal).toEqual({
      rowStates: 15,
      event: 30,
      drift: -15
    })
    expect(result.isClean).toBe(false)
  })

  it('reports a row whose row-state outcome disagrees with the legacy reader as a classification divergence', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 10,
      rowStates: [includedRowState('row-1', 10)],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.classificationDivergences).toEqual([
      {
        rowId: 'row-1',
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
        rowStateIncluded: true,
        legacyIncluded: false
      }
    ])
  })

  it('keeps classification divergence out of the cleanliness verdict (context-sensitive signal)', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 10,
      rowStates: [includedRowState('row-1', 10)],
      wasteRecords: [committedRecord('row-1', 'log-2')],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.classificationDivergences).toHaveLength(1)
    expect(result.isClean).toBe(true)
  })

  it('excludes non-included row-states from the row-state credit total', () => {
    const result = reconcileRegistration({
      ...partition,
      head: 'log-2',
      eventCreditTotal: 10,
      rowStates: [includedRowState('row-1', 10), excludedRowState('row-2')],
      wasteRecords: [
        committedRecord('row-1', 'log-2'),
        committedRecord('row-2', 'log-2')
      ],
      accreditation: null,
      overseasSites: {}
    })

    expect(result.creditTotal).toEqual({ rowStates: 10, event: 10, drift: 0 })
  })
})
