import { creditedTonnageByMonth } from './credited-tonnage.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'

const RANGE = { fromMonth: '2026-01', toMonth: '2026-03' }

const REPROCESSOR_INPUT = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.INPUT
}
const REPROCESSOR_OUTPUT = {
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType: REPROCESSING_TYPE.OUTPUT
}
const EXPORTER = { wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER }

const included = (transactionAmount) => ({
  outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
  reasons: [],
  transactionAmount
})

const notIncluded = (outcome) => ({
  outcome,
  reasons: [],
  transactionAmount: 0
})

const receivedRow = (rowId, date, tonnage, classification) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  },
  classification
})

const sentOnRow = (rowId, date, tonnage) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: tonnage
  },
  classification: included(-tonnage)
})

const processedRow = (rowId, date, tonnage, classification) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: tonnage
  },
  classification
})

const exportedRow = (rowId, date, data, classification) => ({
  rowId,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: { DATE_RECEIVED_BY_OSR: date, ...data },
  classification
})

const monthFor = (result, key) =>
  result.months.find((entry) => entry.month === key)

describe('creditedTonnageByMonth', () => {
  describe('per-table column, figure and date rules', () => {
    it('buckets reprocessor-input received loads by DATE_RECEIVED_FOR_REPROCESSING using TONNAGE_RECEIVED_FOR_RECYCLING into totalCredited and eligible', () => {
      const result = creditedTonnageByMonth(
        [receivedRow('1000', '2026-02-10', 12.5, included(12.5))],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-02')).toEqual({
        month: '2026-02',
        totalCredited: 12.5,
        eligibleForWasteBalance: 12.5,
        sentOnDeductions: 0
      })
    })

    it('buckets reprocessor-input sent-on loads by DATE_LOAD_LEFT_SITE using TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON into sentOnDeductions as a positive number', () => {
      const result = creditedTonnageByMonth(
        [sentOnRow('5000', '2026-03-01', 7.25)],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-03')).toEqual({
        month: '2026-03',
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 7.25
      })
    })

    it('buckets reprocessor-output reprocessed loads by DATE_LOAD_LEFT_SITE using PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION into totalCredited and eligible', () => {
      const result = creditedTonnageByMonth(
        [processedRow('3000', '2026-01-20', 30, included(30))],
        REPROCESSOR_OUTPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01')).toEqual({
        month: '2026-01',
        totalCredited: 30,
        eligibleForWasteBalance: 30,
        sentOnDeductions: 0
      })
    })

    it('buckets exporter received-for-export loads by DATE_RECEIVED_BY_OSR using TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED into totalCredited and eligible', () => {
      const result = creditedTonnageByMonth(
        [
          exportedRow(
            '1000',
            '2026-02-15',
            { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 40 },
            included(40)
          )
        ],
        EXPORTER,
        RANGE
      )

      expect(monthFor(result, '2026-02')).toEqual({
        month: '2026-02',
        totalCredited: 40,
        eligibleForWasteBalance: 40,
        sentOnDeductions: 0
      })
    })
  })

  describe('crediting table is fixed by the accreditation processing type', () => {
    it('ignores a received load on a reprocessor-output accreditation and does not count it as skipped', () => {
      const result = creditedTonnageByMonth(
        [receivedRow('1000', '2026-02-10', 500, included(500))],
        REPROCESSOR_OUTPUT,
        RANGE
      )

      expect(monthFor(result, '2026-02')).toEqual({
        month: '2026-02',
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 0
      })
      expect(result.skippedRowCount).toBe(0)
    })

    it('ignores a processed load on a reprocessor-input accreditation and does not count it as skipped even with an out-of-range date', () => {
      const result = creditedTonnageByMonth(
        [processedRow('3000', '2025-06-01', 500, included(500))],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(result.months.every((entry) => entry.totalCredited === 0)).toBe(
        true
      )
      expect(result.skippedRowCount).toBe(0)
    })

    it('treats a reprocessor accreditation with no reprocessing type as input, crediting received loads', () => {
      const result = creditedTonnageByMonth(
        [receivedRow('1000', '2026-01-10', 15, included(15))],
        { wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR },
        RANGE
      )

      expect(monthFor(result, '2026-01').totalCredited).toBe(15)
    })
  })

  describe('gross totalCredited versus INCLUDED eligible', () => {
    it('counts a non-INCLUDED crediting row in totalCredited but not in eligible', () => {
      const result = creditedTonnageByMonth(
        [
          receivedRow('1000', '2026-01-05', 100, included(100)),
          receivedRow(
            '1001',
            '2026-01-06',
            60,
            notIncluded(WASTE_BALANCE_OUTCOME.EXCLUDED)
          ),
          receivedRow(
            '1002',
            '2026-01-07',
            25,
            notIncluded(WASTE_BALANCE_OUTCOME.IGNORED)
          )
        ],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01')).toMatchObject({
        totalCredited: 185,
        eligibleForWasteBalance: 100
      })
    })

    it('reads eligible from the persisted classification, not the tonnage column', () => {
      const result = creditedTonnageByMonth(
        [receivedRow('1000', '2026-01-05', 100, included(90))],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01')).toMatchObject({
        totalCredited: 100,
        eligibleForWasteBalance: 90
      })
    })
  })

  describe('exporter interim-site tonnage column', () => {
    it('uses TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR for totalCredited when the load passed an interim site', () => {
      const result = creditedTonnageByMonth(
        [
          exportedRow(
            '1000',
            '2026-03-09',
            {
              DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'Yes',
              TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 18,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 99
            },
            included(18)
          )
        ],
        EXPORTER,
        RANGE
      )

      expect(monthFor(result, '2026-03')).toMatchObject({
        totalCredited: 18,
        eligibleForWasteBalance: 18
      })
    })

    it('uses TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED when the load did not pass an interim site', () => {
      const result = creditedTonnageByMonth(
        [
          exportedRow(
            '1000',
            '2026-03-09',
            {
              DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
              TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR: 18,
              TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 99
            },
            included(99)
          )
        ],
        EXPORTER,
        RANGE
      )

      expect(monthFor(result, '2026-03')).toMatchObject({ totalCredited: 99 })
    })
  })

  describe('deductible only for reprocessor input', () => {
    it('contributes nothing for a sent-on row on an exporter accreditation', () => {
      const result = creditedTonnageByMonth(
        [sentOnRow('4000', '2026-02-02', 50)],
        EXPORTER,
        RANGE
      )

      expect(monthFor(result, '2026-02')).toEqual({
        month: '2026-02',
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 0
      })
      expect(result.skippedRowCount).toBe(0)
    })

    it('contributes nothing for a sent-on row on a reprocessor-output accreditation', () => {
      const result = creditedTonnageByMonth(
        [sentOnRow('5000', '2026-02-02', 50)],
        REPROCESSOR_OUTPUT,
        RANGE
      )

      expect(monthFor(result, '2026-02').sentOnDeductions).toBe(0)
    })
  })

  describe('month bucketing and zero-fill', () => {
    it('returns one ascending entry per month in the injected range', () => {
      const result = creditedTonnageByMonth([], EXPORTER, {
        fromMonth: '2025-11',
        toMonth: '2026-02'
      })

      expect(result.months.map((entry) => entry.month)).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02'
      ])
    })

    it('zero-fills months with no rows and buckets each row into its own month', () => {
      const result = creditedTonnageByMonth(
        [
          receivedRow('1000', '2026-01-15', 10, included(10)),
          receivedRow('1001', '2026-03-15', 20, included(20))
        ],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01').totalCredited).toBe(10)
      expect(monthFor(result, '2026-02')).toEqual({
        month: '2026-02',
        totalCredited: 0,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 0
      })
      expect(monthFor(result, '2026-03').totalCredited).toBe(20)
    })
  })

  describe('skipping rows with missing, unparseable or out-of-range dates', () => {
    it.each([
      { description: 'missing (undefined) date', date: undefined },
      { description: 'null date', date: null },
      { description: 'empty-string date', date: '' },
      { description: 'unparseable date', date: 'not-a-date' },
      { description: 'date before the range', date: '2025-12-31' },
      { description: 'date after the range', date: '2026-04-01' }
    ])(
      'drops a crediting row with a $description and counts it as skipped',
      ({ date }) => {
        const result = creditedTonnageByMonth(
          [receivedRow('1000', date, 10, included(10))],
          REPROCESSOR_INPUT,
          RANGE
        )

        expect(result.skippedRowCount).toBe(1)
        expect(result.months.every((entry) => entry.totalCredited === 0)).toBe(
          true
        )
      }
    )

    it('counts a sent-on row with an unparseable date as skipped on a reprocessor-input accreditation', () => {
      const result = creditedTonnageByMonth(
        [sentOnRow('5000', 'not-a-date', 12)],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(result.skippedRowCount).toBe(1)
      expect(result.months.every((entry) => entry.sentOnDeductions === 0)).toBe(
        true
      )
    })

    it('counts each dropped row and still aggregates the in-range rows', () => {
      const result = creditedTonnageByMonth(
        [
          receivedRow('1000', '2026-02-01', 10, included(10)),
          receivedRow('1001', 'not-a-date', 99, included(99)),
          receivedRow('1002', '2026-09-01', 88, included(88))
        ],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(result.skippedRowCount).toBe(2)
      expect(monthFor(result, '2026-02').totalCredited).toBe(10)
    })
  })

  describe('decimal-safe sums', () => {
    it('sums fractional credited tonnages without binary floating-point drift', () => {
      const result = creditedTonnageByMonth(
        [
          receivedRow('1000', '2026-01-01', 0.1, included(0.1)),
          receivedRow('1001', '2026-01-02', 0.2, included(0.2))
        ],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01')).toMatchObject({
        totalCredited: 0.3,
        eligibleForWasteBalance: 0.3
      })
    })

    it('sums fractional deductible tonnages without binary floating-point drift', () => {
      const result = creditedTonnageByMonth(
        [
          sentOnRow('5000', '2026-01-01', 0.1),
          sentOnRow('5001', '2026-01-02', 0.2)
        ],
        REPROCESSOR_INPUT,
        RANGE
      )

      expect(monthFor(result, '2026-01').sentOnDeductions).toBe(0.3)
    })
  })

  describe('reconciliation invariant', () => {
    it('sums eligible across all months to the total transactionAmount of the crediting row states', () => {
      const rowStates = [
        exportedRow(
          '1000',
          '2026-01-10',
          { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 12.34 },
          included(12.34)
        ),
        exportedRow(
          '1001',
          '2026-02-10',
          { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 56.78 },
          included(56.78)
        ),
        exportedRow(
          '1002',
          '2026-03-10',
          { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 40 },
          notIncluded(WASTE_BALANCE_OUTCOME.EXCLUDED)
        )
      ]

      const result = creditedTonnageByMonth(rowStates, EXPORTER, RANGE)

      const totalTransactionAmount = rowStates.reduce(
        (sum, row) => sum + row.classification.transactionAmount,
        0
      )
      const totalEligible = result.months.reduce(
        (sum, entry) => sum + entry.eligibleForWasteBalance,
        0
      )

      expect(totalEligible).toBeCloseTo(totalTransactionAmount, 10)
      expect(totalEligible).toBe(69.12)
    })
  })
})
