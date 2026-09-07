import { describe, it, expect } from 'vitest'

import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  RECEIVED_LOADS_FOR_REPROCESSING_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/shared/fields.js'
import { RECEIVED_LOADS_FIELDS as EXPORTER_RECEIVED_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { partialMock } from '#test/type-helpers.js'

import { decemberCreditTotalFor } from './december-credit-total.js'

/**
 * Unit coverage for the branches integration cannot reach: the year-boundary
 * exclusions, missing dates, non-contributing tables, the reprocessor-output
 * invariant, and an accreditation with no validFrom. The accreditation year is
 * read from validFrom, so December of the year is `2025-12` throughout.
 */
const ACCREDITATION = partialMock({ validFrom: '2025-01-01' })

const receivedRow = (dateReceived, transactionAmount) => ({
  rowId: 'r',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    [RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING]:
      dateReceived
  },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount
  }
})

const sentOnRow = (dateLeft, transactionAmount) => ({
  rowId: 's',
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    [SENT_ON_LOADS_FIELDS.DATE_LOAD_LEFT_SITE]: dateLeft
  },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount
  }
})

const exporterRow = (dateReceivedByOsr, transactionAmount) => ({
  rowId: 'e',
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    processingType: PROCESSING_TYPES.EXPORTER,
    [EXPORTER_RECEIVED_FIELDS.DATE_RECEIVED_BY_OSR]: dateReceivedByOsr
  },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount
  }
})

describe('decemberCreditTotalFor', () => {
  it('sums only December-dated contributions, carrying their signs', () => {
    const rows = [
      receivedRow('2025-12-10T00:00:00.000Z', 200),
      sentOnRow('2025-12-20T00:00:00.000Z', -50),
      receivedRow('2025-06-10T00:00:00.000Z', 100)
    ]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(150)
  })

  // Locks which crediting rows accrue December for each processing type that
  // reaches this code. December is only computed for accredited submissions, so
  // the registered-only template variants never arrive here and are out of
  // scope. If the crediting table for a type ever changes, one of these breaks.
  it('accrues December for an exporter row keyed on its received-by-OSR date', () => {
    const rows = [
      exporterRow('2025-12-18T00:00:00.000Z', 200),
      exporterRow('2025-06-18T00:00:00.000Z', 100)
    ]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(200)
  })

  it('excludes the adjacent months and the prior year December (year boundary)', () => {
    const rows = [
      receivedRow('2025-11-30T00:00:00.000Z', 100),
      receivedRow('2025-01-15T00:00:00.000Z', 100),
      receivedRow('2024-12-15T00:00:00.000Z', 100)
    ]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(0)
  })

  it('ignores a row with a missing balance-affecting date', () => {
    const rows = [receivedRow(undefined, 100)]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(0)
  })

  it('ignores a row whose table does not contribute for the processing type', () => {
    // A processed row under a reprocessor-input accreditation is supplementary,
    // so it contributes nothing even when dated in December.
    const rows = [
      {
        rowId: 'p',
        wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
          [RECEIVED_LOADS_FOR_REPROCESSING_FIELDS.DATE_RECEIVED_FOR_REPROCESSING]:
            '2025-12-10T00:00:00.000Z'
        },
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: 100
        }
      }
    ]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(0)
  })

  it('never accrues December for reprocessor-output, even for a December-dated row', () => {
    const rows = [
      {
        rowId: 'o',
        wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
          DATE_LOAD_LEFT_SITE: '2025-12-10T00:00:00.000Z'
        },
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: 100
        }
      }
    ]

    expect(decemberCreditTotalFor(rows, ACCREDITATION)).toBe(0)
  })

  it('returns zero when the accreditation has no validFrom', () => {
    const rows = [receivedRow('2025-12-10T00:00:00.000Z', 100)]

    expect(decemberCreditTotalFor(rows, partialMock({}))).toBe(0)
  })
})
