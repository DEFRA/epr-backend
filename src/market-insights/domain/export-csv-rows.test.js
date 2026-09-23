import {
  MATERIAL,
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { recordOf } from '#common/helpers/record-of.js'
import {
  noMeasures,
  withOperatorCounts,
  withPublishedFigures,
  withSentOnTotal
} from '#market-insights/domain/reprocessor-exporter-figures.js'
import { NO_FIGURES, withNetCredit } from './waste-balance-figures.js'
import {
  buildExporterRows,
  buildManifestRow,
  buildOutstandingReturnsRows,
  buildReportCoverageRows,
  buildReprocessorRows,
  buildWasteBalanceRows,
  EXPORTER_COLUMNS,
  MANIFEST_COLUMNS,
  OUTSTANDING_RETURNS_COLUMNS,
  REPORTS_COLUMNS,
  REPROCESSOR_COLUMNS,
  WASTE_BALANCE_COLUMNS
} from './export-csv-rows.js'

const MATERIAL_COUNT = TONNAGE_MONITORING_MATERIALS.length
const ACCREDITATION_TYPES = Object.values(WASTE_PROCESSING_TYPE)
const TONNAGE_BANDS = Object.values(TONNAGE_BAND)

/**
 * A waste balance table as the endpoint serves it: every material and
 * accreditation type present in every month, at zero but for the overrides.
 *
 * @param {string[]} months
 * @param {Record<string, Partial<import('./waste-balance-figures.js').WasteBalanceFigures>>} [overrides] - keyed `month::material::type`
 */
const wasteBalanceTable = (months, overrides = {}) => ({
  meta: { generatedAt: '2026-09-18T14:15:30.000Z' },
  data: {
    months: recordOf(months, (month) => ({
      reports: { expected: 0, submitted: 0 },
      figures: recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
        recordOf(ACCREDITATION_TYPES, (accreditationType) => ({
          ...withNetCredit({
            ...NO_FIGURES,
            ...overrides[`${month}::${material}::${accreditationType}`]
          }),
          operatorCount: 0,
          submittingOperatorCount: 0
        }))
      )
    })),
    period: {
      reports: { expected: 0, submitted: 0 },
      operatorCounts: recordOf(TONNAGE_MONITORING_MATERIALS, () =>
        recordOf(ACCREDITATION_TYPES, () => ({
          operatorCount: 0,
          submittingOperatorCount: 0
        }))
      )
    }
  }
})

/**
 * @template {Record<string, number>} T
 * @param {T} figures
 */
const withNoOperators = (figures) =>
  withOperatorCounts(figures, {
    operatorCount: 0,
    submittingOperatorCount: 0,
    contributingOperatorCountOf: () => 0
  })

/**
 * @param {string[]} months
 * @param {Record<string, object>} [overrides] - keyed `month::material::type`
 */
const reprocessorExporterTable = (months, overrides = {}) => ({
  meta: { generatedAt: '2026-09-18T14:15:30.000Z' },
  data: {
    months: recordOf(months, (month) => ({
      reports: { expected: 0, submitted: 0 },
      figures: recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
        recordOf(ACCREDITATION_TYPES, (accreditationType) =>
          withNoOperators(
            withPublishedFigures({
              ...noMeasures(accreditationType),
              ...overrides[`${month}::${material}::${accreditationType}`]
            })
          )
        )
      ),
      totals: recordOf(ACCREDITATION_TYPES, (accreditationType) =>
        withNoOperators(withSentOnTotal(noMeasures(accreditationType)))
      )
    })),
    period: { reports: { expected: 0, submitted: 0 } }
  }
})

/**
 * @param {string[]} months
 * @param {Record<string, number>} [overrides] - keyed `month::material::band`
 */
const outstandingReturnsTable = (months, overrides = {}) => ({
  meta: { generatedAt: '2026-09-18T14:15:30.000Z' },
  data: {
    months: recordOf(months, (month) => ({
      figures: recordOf(TONNAGE_MONITORING_MATERIALS, (material) =>
        recordOf(
          TONNAGE_BANDS,
          (band) => overrides[`${month}::${material}::${band}`] ?? 0
        )
      )
    }))
  }
})

/**
 * @param {(string | number)[][]} rows
 * @param {readonly string[]} columns
 * @param {string} column
 */
const columnOf = (rows, columns, column) =>
  rows.map((cells) => cells[columns.indexOf(column)])

describe('market insights export CSV rows', () => {
  describe('waste balance', () => {
    it('collapses the repeated per-month table into a month column', () => {
      const rows = buildWasteBalanceRows(
        wasteBalanceTable(['2026-01', '2026-02'])
      )

      expect(rows).toHaveLength(2 * MATERIAL_COUNT * ACCREDITATION_TYPES.length)
      expect(new Set(columnOf(rows, WASTE_BALANCE_COLUMNS, 'month'))).toEqual(
        new Set(['2026-01', '2026-02'])
      )
    })

    it('serves every material and accreditation type at zero where nothing was reported', () => {
      const rows = buildWasteBalanceRows(wasteBalanceTable(['2026-01']))

      expect(
        new Set(columnOf(rows, WASTE_BALANCE_COLUMNS, 'material'))
      ).toEqual(new Set(TONNAGE_MONITORING_MATERIALS))
      expect(columnOf(rows, WASTE_BALANCE_COLUMNS, 'net_credit')).toEqual(
        Array(MATERIAL_COUNT * ACCREDITATION_TYPES.length).fill(0)
      )
    })

    it('writes the net credit alone, unrounded and as served', () => {
      const rows = buildWasteBalanceRows(
        wasteBalanceTable(['2026-01'], {
          [`2026-01::${MATERIAL.WOOD}::${WASTE_PROCESSING_TYPE.EXPORTER}`]: {
            totalCredited: 120.55,
            eligibleForWasteBalance: 100.25,
            sentOnDeductions: 12.5
          }
        })
      )

      expect(
        rows.find(
          ([, material, type]) =>
            material === MATERIAL.WOOD &&
            type === WASTE_PROCESSING_TYPE.EXPORTER
        )
      ).toEqual([
        '2026-01',
        MATERIAL.WOOD,
        WASTE_PROCESSING_TYPE.EXPORTER,
        87.75
      ])
    })

    it('carries a negative net credit as a number rather than escaping it as a formula', () => {
      const rows = buildWasteBalanceRows(
        wasteBalanceTable(['2026-01'], {
          [`2026-01::${MATERIAL.STEEL}::${WASTE_PROCESSING_TYPE.REPROCESSOR}`]:
            {
              eligibleForWasteBalance: 10,
              sentOnDeductions: 30
            }
        })
      )

      expect(rows).toContainEqual([
        '2026-01',
        MATERIAL.STEEL,
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        -20
      ])
    })

    it('escapes a string cell that opens with a formula character', () => {
      const rows = buildWasteBalanceRows(wasteBalanceTable(['=cmd|calc']))

      expect(columnOf(rows, WASTE_BALANCE_COLUMNS, 'month')).toContain(
        "'=cmd|calc"
      )
    })
  })

  describe('reprocessor figures', () => {
    it('writes one row per material per month, in the published column order', () => {
      const rows = buildReprocessorRows(
        reprocessorExporterTable(['2026-01', '2026-02'], {
          [`2026-01::${MATERIAL.PLASTIC}::${WASTE_PROCESSING_TYPE.REPROCESSOR}`]:
            {
              tonnageReceived: 500.5,
              tonnageRecycled: 450.25,
              tonnageReceivedButNotRecycled: 50.25,
              tonnageSentOnToReprocessor: 10,
              tonnageSentOnToExporter: 20,
              tonnageSentOnToOtherFacilities: 30,
              revisedTonnageIssued: 400,
              totalRevenue: 8000
            }
        })
      )

      expect(rows).toHaveLength(2 * MATERIAL_COUNT)
      expect(
        rows.find(
          ([month, material]) =>
            month === '2026-01' && material === MATERIAL.PLASTIC
        )
      ).toEqual([
        '2026-01',
        MATERIAL.PLASTIC,
        500.5,
        450.25,
        50.25,
        60,
        10,
        20,
        30,
        400,
        8000,
        20
      ])
      expect(REPROCESSOR_COLUMNS).toHaveLength(12)
    })

    it('carries no grand total row, since the page renders none', () => {
      const rows = buildReprocessorRows(reprocessorExporterTable(['2026-01']))

      expect(new Set(columnOf(rows, REPROCESSOR_COLUMNS, 'material'))).toEqual(
        new Set(TONNAGE_MONITORING_MATERIALS)
      )
    })
  })

  describe('exporter figures', () => {
    it('writes the export-only measures alongside the shared ones', () => {
      const rows = buildExporterRows(
        reprocessorExporterTable(['2026-03'], {
          [`2026-03::${MATERIAL.ALUMINIUM}::${WASTE_PROCESSING_TYPE.EXPORTER}`]:
            {
              tonnageReceived: 200,
              tonnageExported: 180,
              tonnageReceivedButNotExported: 20,
              tonnageSentOnToReprocessor: 1,
              tonnageSentOnToExporter: 2,
              tonnageSentOnToOtherFacilities: 3,
              tonnageStopped: 4,
              tonnageRefused: 5,
              tonnageRepatriated: 6,
              revisedTonnageIssued: 100,
              totalRevenue: 2500
            }
        })
      )

      expect(rows).toHaveLength(MATERIAL_COUNT)
      expect(
        rows.find(([, material]) => material === MATERIAL.ALUMINIUM)
      ).toEqual([
        '2026-03',
        MATERIAL.ALUMINIUM,
        200,
        180,
        20,
        6,
        1,
        2,
        3,
        4,
        5,
        6,
        100,
        2500,
        25
      ])
      expect(EXPORTER_COLUMNS).toHaveLength(15)
    })
  })

  describe('outstanding returns', () => {
    it('writes one row per material and tonnage band per month', () => {
      const rows = buildOutstandingReturnsRows(
        outstandingReturnsTable(['2026-01', '2026-02'], {
          [`2026-01::${MATERIAL.PAPER}::${TONNAGE_BAND.OVER_10000}`]: 3
        })
      )

      expect(rows).toHaveLength(2 * MATERIAL_COUNT * TONNAGE_BANDS.length)
      expect(rows).toContainEqual([
        '2026-01',
        MATERIAL.PAPER,
        TONNAGE_BAND.OVER_10000,
        3
      ])
      expect(
        columnOf(rows, OUTSTANDING_RETURNS_COLUMNS, 'outstanding_count').filter(
          (count) => count === 0
        )
      ).toHaveLength(2 * MATERIAL_COUNT * TONNAGE_BANDS.length - 1)
    })
  })

  describe('report coverage', () => {
    it('says how many returns each month was owed and how many arrived', () => {
      const rows = buildReportCoverageRows('uk', {
        data: {
          months: {
            '2026-01': { reports: { expected: 40, submitted: 3 } },
            '2026-02': { reports: { expected: 40, submitted: 40 } }
          }
        }
      })

      expect(REPORTS_COLUMNS).toEqual([
        'month',
        'scope',
        'reports_expected',
        'reports_submitted'
      ])
      expect(rows).toEqual([
        ['2026-01', 'uk', 40, 3],
        ['2026-02', 'uk', 40, 40]
      ])
    })

    it('names the scope, so counts over different populations stay apart', () => {
      const table = {
        data: {
          months: { '2026-01': { reports: { expected: 9, submitted: 9 } } }
        }
      }

      expect([
        ...buildReportCoverageRows('waste-balance', table),
        ...buildReportCoverageRows('wales', table)
      ]).toEqual([
        ['2026-01', 'waste-balance', 9, 9],
        ['2026-01', 'wales', 9, 9]
      ])
    })
  })

  describe('manifest', () => {
    it('records the reporting period and the moment the figures were taken', () => {
      const cells = buildManifestRow({
        year: 2026,
        cadence: 'monthly',
        period: 6,
        months: [
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
          '2026-05',
          '2026-06'
        ],
        generatedAt: '2026-09-18T14:15:30.000Z'
      })

      expect(MANIFEST_COLUMNS).toEqual([
        'reporting_year',
        'cadence',
        'period',
        'period_start',
        'period_end',
        'generated_at'
      ])
      expect(cells).toEqual([
        2026,
        'monthly',
        6,
        '2026-01',
        '2026-06',
        '2026-09-18T14:15:30.000Z'
      ])
    })
  })
})
