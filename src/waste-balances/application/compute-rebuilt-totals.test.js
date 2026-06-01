import { describe, it, expect, vi, beforeEach } from 'vitest'
import Joi from 'joi'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { buildWasteRecord } from '#repositories/waste-records/contract/test-data.js'

import { computeRebuiltTotals } from './compute-rebuilt-totals.js'

/**
 * @typedef {import('#domain/summary-logs/table-schemas/index.js').TableSchema} TableSchema
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatusHistoryItem} PrnStatusHistoryItem
 * @typedef {import('#packaging-recycling-notes/domain/model.js').Actor} Actor
 * @typedef {import('#domain/waste-records/model.js').WasteRecordType} WasteRecordType
 */

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const { findSchemaForProcessingType } =
  await import('#domain/summary-logs/table-schemas/index.js')

const includedAt = (amount) => ({
  outcome: ROW_OUTCOME.INCLUDED,
  reasons: [],
  transactionAmount: amount
})

/**
 * @param {TableSchema['classifyForWasteBalance']} classifyForWasteBalance
 * @returns {TableSchema}
 */
const tableSchemaWith = (classifyForWasteBalance) => ({
  rowIdField: 'rowId',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  sheetName: 'Received',
  rowTransformer: (rowData) => ({
    wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
    rowId: '',
    data: rowData
  }),
  requiredHeaders: [],
  unfilledValues: {},
  validationSchema: Joi.object(),
  classifyForWasteBalance
})

/**
 * @param {{
 *   rowId: string,
 *   type?: WasteRecordType,
 *   processingType?: string,
 *   excludedFromWasteBalance?: boolean,
 *   data?: Record<string, unknown>
 * }} options
 */
const wasteRecord = ({
  rowId,
  type = WASTE_RECORD_TYPE.RECEIVED,
  processingType = 'REPROCESSOR_INPUT',
  excludedFromWasteBalance = false,
  data = {}
}) =>
  buildWasteRecord({
    rowId,
    type,
    data: { processingType, ...data },
    excludedFromWasteBalance
  })

/** @type {Actor} */
const DEFAULT_ACTOR = { id: 'user-1', name: 'Alice' }

/**
 * @param {Array<[PrnStatus, string]>} entries
 * @returns {PrnStatusHistoryItem[]}
 */
const prnHistory = (entries) =>
  entries.map(([status, at]) => ({
    status,
    at: new Date(at),
    by: DEFAULT_ACTOR
  }))

/**
 * @param {{ id: string, tonnage: number, history?: Array<[PrnStatus, string]> }} options
 * @returns {PackagingRecyclingNote}
 */
const prn = ({
  id,
  tonnage,
  history = [
    [PRN_STATUS.DRAFT, '2025-01-01T00:00:00.000Z'],
    [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-02T00:00:00.000Z']
  ]
}) => {
  const statusHistory = prnHistory(history)
  const latest = statusHistory[statusHistory.length - 1]
  return {
    id,
    schemaVersion: 2,
    version: 1,
    prnNumber: null,
    organisation: { id: 'org-1', name: 'ACME ltd' },
    registrationId: 'reg-1',
    accreditation: {
      id: 'acc-1',
      accreditationNumber: 'ACC-001',
      accreditationYear: 2025,
      material: 'glass',
      submittedToRegulator: 'ea'
    },
    issuedToOrganisation: { id: 'producer-1', name: 'Producer Ltd' },
    tonnage,
    isExport: false,
    isDecemberWaste: false,
    status: {
      currentStatus: latest.status,
      currentStatusAt: latest.at,
      history: statusHistory
    },
    createdAt: statusHistory[0].at,
    createdBy: DEFAULT_ACTOR,
    updatedAt: latest.at,
    updatedBy: DEFAULT_ACTOR
  }
}

/** @type {import('#domain/organisations/accreditation.js').Accreditation} */
const accreditation = {
  id: 'acc-1',
  status: 'created',
  statusHistory: [{ status: 'created', updatedAt: '2025-01-01T00:00:00.000Z' }],
  formSubmission: { id: 'form-1', time: new Date('2025-01-01T00:00:00.000Z') },
  material: 'glass',
  prnIssuance: {
    incomeBusinessPlan: [],
    signatories: [],
    tonnageBand: 'up_to_500'
  },
  submittedToRegulator: 'ea',
  submitterContactDetails: {
    fullName: 'Anakin Skywalker',
    email: 'anakin@example.com',
    phone: '0123456789'
  },
  wasteProcessingType: 'reprocessor'
}

/** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
const overseasSites = ORS_VALIDATION_DISABLED

describe('computeRebuiltTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(findSchemaForProcessingType).mockReturnValue(
      tableSchemaWith((data) =>
        data.tonnage === undefined
          ? { outcome: ROW_OUTCOME.EXCLUDED, reasons: [] }
          : includedAt(data.tonnage)
      )
    )
  })

  it('returns zero totals when no records or PRNs', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({
      amount: 0,
      availableAmount: 0,
      wasteRecordContribution: 0,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

    expect(result).toEqual({
      amount: 10,
      availableAmount: 10,
      wasteRecordContribution: 10,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

    expect(result).toEqual({
      amount: 4,
      availableAmount: 4,
      wasteRecordContribution: 4,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

    expect(result).toEqual({
      amount: 0,
      availableAmount: 0,
      wasteRecordContribution: 0,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
  })

  it('skips records whose schema has no classifyForWasteBalance', () => {
    vi.mocked(findSchemaForProcessingType).mockReturnValueOnce(
      tableSchemaWith(null)
    )

    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 4 } })],
      prns: [],
      overseasSites
    })

    expect(result).toEqual({
      amount: 0,
      availableAmount: 0,
      wasteRecordContribution: 0,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
  })

  it('debits availableAmount only when a PRN is in AWAITING_AUTHORISATION', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [wasteRecord({ rowId: 'r-1', data: { tonnage: 10 } })],
      prns: [prn({ id: 'prn-1', tonnage: 3 })],
      overseasSites
    })

    expect(result).toEqual({
      amount: 10,
      availableAmount: 7,
      wasteRecordContribution: 10,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: -3
    })
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

    expect(result).toEqual({
      amount: 7,
      availableAmount: 7,
      wasteRecordContribution: 10,
      prnAmountContribution: -3,
      prnAvailableAmountContribution: -3
    })
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

    expect(result).toEqual({
      amount: 6,
      availableAmount: 6,
      wasteRecordContribution: 10,
      prnAmountContribution: -4,
      prnAvailableAmountContribution: -4
    })
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

    expect(result).toEqual({
      amount: 10,
      availableAmount: 10,
      wasteRecordContribution: 10,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

    expect(result).toEqual({
      amount: 10,
      availableAmount: 10,
      wasteRecordContribution: 10,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

    expect(result).toEqual({
      amount: 10,
      availableAmount: 10,
      wasteRecordContribution: 10,
      prnAmountContribution: 0,
      prnAvailableAmountContribution: 0
    })
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

  it('breaks the rebuilt totals down by input so divergence diagnostics can attribute the rebuild to waste records vs PRN activity', () => {
    const result = computeRebuiltTotals({
      accreditation,
      wasteRecords: [
        wasteRecord({ rowId: 'r-1', data: { tonnage: 12 } }),
        wasteRecord({ rowId: 'r-2', data: { tonnage: 8 } })
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
        })
      ],
      overseasSites
    })

    expect(result.wasteRecordContribution).toBe(20)
    expect(result.prnAmountContribution).toBe(-5)
    expect(result.prnAvailableAmountContribution).toBe(-7)
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
          id: 'prn-removed',
          tonnage: 3,
          history: [
            [PRN_STATUS.DRAFT, '2025-01-08T00:00:00.000Z'],
            [PRN_STATUS.AWAITING_AUTHORISATION, '2025-01-09T00:00:00.000Z'],
            [PRN_STATUS.DELETED, '2025-01-10T00:00:00.000Z']
          ]
        })
      ],
      overseasSites
    })

    // 20t credit; issued PRN debits both fields by 5t; pending PRN debits
    // available by 2t; cancelled-pre-issue nets to zero on both fields
    expect(result).toEqual({
      amount: 15,
      availableAmount: 13,
      wasteRecordContribution: 20,
      prnAmountContribution: -5,
      prnAvailableAmountContribution: -7
    })
  })
})
