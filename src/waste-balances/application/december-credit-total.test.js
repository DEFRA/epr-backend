import { decemberCreditTotalFor } from './december-credit-total.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

// A row's granular processing type lives on its own data, exactly as
// classification reads it; the accreditation supplies only its validFrom year.
const EXPORTER = { validFrom: '2026-01-01' }
const REPROCESSOR_INPUT = { validFrom: '2026-01-01' }
const REPROCESSOR_OUTPUT = { validFrom: '2026-01-01' }

const included = (transactionAmount) => ({
  outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
  reasons: [],
  transactionAmount
})

const excluded = () => ({
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
})

const exportedRow = (dateReceivedByOsr, classification) => ({
  rowId: `exported-${dateReceivedByOsr}`,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    processingType: PROCESSING_TYPES.EXPORTER,
    DATE_RECEIVED_BY_OSR: dateReceivedByOsr,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 999
  },
  classification
})

const receivedRow = (date, classification) => ({
  rowId: `received-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_RECEIVED_FOR_REPROCESSING: date,
    TONNAGE_RECEIVED_FOR_RECYCLING: 999
  },
  classification
})

const sentOnRow = (date, classification) => ({
  rowId: `sent-on-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_LOAD_LEFT_SITE: date,
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 999
  },
  classification
})

/**
 * @param {string} date
 * @param {any} classification
 * @param {string} [processingType]
 */
const processedRow = (
  date,
  classification,
  processingType = PROCESSING_TYPES.REPROCESSOR_OUTPUT
) => ({
  rowId: `processed-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  data: {
    processingType,
    DATE_LOAD_LEFT_SITE: date,
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: 999
  },
  classification
})

describe('decemberCreditTotalFor', () => {
  describe('which December: the accreditation-year December bucket', () => {
    it('accrues only tonnage dated in December of the accreditation year', () => {
      const rows = [
        exportedRow('2026-12-05', included(10)),
        exportedRow('2026-06-10', included(20)),
        exportedRow('2025-12-31', included(40)),
        exportedRow('2027-12-01', included(80))
      ]

      expect(decemberCreditTotalFor(rows, EXPORTER)).toBe(10)
    })

    it('reads the December year from validFrom, not the current clock', () => {
      const rows2025 = [exportedRow('2025-12-15', included(30))]
      const acc2025 = { ...EXPORTER, validFrom: '2025-07-01' }

      expect(decemberCreditTotalFor(rows2025, acc2025)).toBe(30)
      expect(decemberCreditTotalFor(rows2025, EXPORTER)).toBe(0)
    })
  })

  describe('date edges around the December boundary', () => {
    it.each([
      { label: '30 November (before)', date: '2026-11-30', accrues: false },
      { label: '1 December (start)', date: '2026-12-01', accrues: true },
      { label: '31 December (end)', date: '2026-12-31', accrues: true },
      {
        label: '1 January next year (after)',
        date: '2027-01-01',
        accrues: false
      }
    ])('$label $date accrues=$accrues', ({ date, accrues }) => {
      const rows = [exportedRow(date, included(25))]

      expect(decemberCreditTotalFor(rows, EXPORTER)).toBe(accrues ? 25 : 0)
    })
  })

  describe('reprocessor-input: the December portion is credits-only', () => {
    it('accrues a December received credit but not a December sent-on load', () => {
      const rows = [
        receivedRow('2026-12-10', included(300)),
        sentOnRow('2026-12-20', included(-200)),
        receivedRow('2026-06-10', included(500))
      ]

      expect(decemberCreditTotalFor(rows, REPROCESSOR_INPUT)).toBe(300)
    })

    it('accrues nothing for a December-dated sent-on load on its own', () => {
      const rows = [sentOnRow('2026-12-20', included(-200))]

      expect(decemberCreditTotalFor(rows, REPROCESSOR_INPUT)).toBe(0)
    })
  })

  describe('reprocessor-output never accrues December', () => {
    it('accrues nothing for a December-dated processed load', () => {
      const rows = [
        processedRow('2026-12-05', included(100)),
        processedRow('2026-12-25', included(200))
      ]

      expect(decemberCreditTotalFor(rows, REPROCESSOR_OUTPUT)).toBe(0)
    })
  })

  describe('only balance-affecting tonnage accrues', () => {
    it('ignores an excluded December row, matching the general credit total', () => {
      const rows = [exportedRow('2026-12-05', excluded())]

      expect(decemberCreditTotalFor(rows, EXPORTER)).toBe(0)
    })

    it('ignores a supplementary row whose table does not contribute under its processing type', () => {
      // A reprocessor-input submission's processed table is supplementary: it
      // carries the input processing type but never credits the balance.
      const rows = [
        processedRow(
          '2026-12-10',
          included(50),
          PROCESSING_TYPES.REPROCESSOR_INPUT
        )
      ]

      expect(decemberCreditTotalFor(rows, REPROCESSOR_INPUT)).toBe(0)
    })
  })

  describe('undeterminable December key accrues nothing', () => {
    it('accrues nothing when validFrom is absent', () => {
      const rows = [exportedRow('2026-12-05', included(10))]

      expect(
        decemberCreditTotalFor(rows, { ...EXPORTER, validFrom: undefined })
      ).toBe(0)
    })

    it('accrues nothing for a missing or unparseable balance-affecting date', () => {
      const rows = [
        exportedRow(undefined, included(10)),
        exportedRow('not-a-date', included(20))
      ]

      expect(decemberCreditTotalFor(rows, EXPORTER)).toBe(0)
    })
  })

  describe('decimal-safe summation', () => {
    it('sums fractional December tonnages without floating-point drift', () => {
      const rows = [
        exportedRow('2026-12-01', included(0.1)),
        exportedRow('2026-12-02', included(0.2))
      ]

      expect(decemberCreditTotalFor(rows, EXPORTER)).toBe(0.3)
    })
  })
})
