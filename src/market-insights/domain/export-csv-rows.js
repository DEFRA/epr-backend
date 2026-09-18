import {
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { sanitiseFormulaInjection } from '#waste-records-export/domain/csv-columns.js'

/** @import { WasteBalanceTable } from '#market-insights/application/waste-balance-table.js' */
/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */
/** @import { OutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js' */
/** @import { PublishedExtras, ExporterMeasures, ReprocessorMeasures } from '#market-insights/domain/reprocessor-exporter-figures.js' */

/** @typedef {(string | number)[]} CsvRow */

const ACCREDITATION_TYPES = Object.values(WASTE_PROCESSING_TYPE)
const TONNAGE_BANDS = Object.values(TONNAGE_BAND)

/**
 * Every string cell leaves escaped, as the waste records export does, so
 * spreadsheet software opens a cell as text rather than as a formula. Numbers
 * pass through untouched and stay numeric.
 *
 * @param {CsvRow} cells
 * @returns {CsvRow}
 */
const row = (cells) => cells.map(sanitiseFormulaInjection)

export const WASTE_BALANCE_COLUMNS = Object.freeze([
  'month',
  'material',
  'accreditation_type',
  'net_credit'
])

export const REPROCESSOR_COLUMNS = Object.freeze([
  'month',
  'material',
  'tonnage_received',
  'tonnage_recycled',
  'tonnage_received_but_not_recycled',
  'tonnage_sent_on_total',
  'tonnage_sent_on_to_reprocessor',
  'tonnage_sent_on_to_exporter',
  'tonnage_sent_on_to_other_facilities',
  'revised_tonnage_issued',
  'total_revenue',
  'average_price_per_tonne'
])

export const EXPORTER_COLUMNS = Object.freeze([
  'month',
  'material',
  'tonnage_received',
  'tonnage_exported',
  'tonnage_received_but_not_exported',
  'tonnage_sent_on_total',
  'tonnage_sent_on_to_reprocessor',
  'tonnage_sent_on_to_exporter',
  'tonnage_sent_on_to_other_facilities',
  'tonnage_stopped',
  'tonnage_refused',
  'tonnage_repatriated',
  'revised_tonnage_issued',
  'total_revenue',
  'average_price_per_tonne'
])

export const OUTSTANDING_RETURNS_COLUMNS = Object.freeze([
  'month',
  'material',
  'tonnage_band',
  'outstanding_count'
])

export const MANIFEST_COLUMNS = Object.freeze([
  'reporting_year',
  'cadence',
  'period',
  'period_start',
  'period_end',
  'generated_at'
])

/**
 * The net credit of every material and accreditation type, month by month. The
 * endpoint also serves the three figures the net credit is reached from; the
 * page prints the net credit alone and so does the export.
 *
 * @param {WasteBalanceTable} table
 * @returns {CsvRow[]}
 */
export const buildWasteBalanceRows = ({ data }) =>
  Object.entries(data.months).flatMap(([month, { figures }]) =>
    TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
      ACCREDITATION_TYPES.map((accreditationType) =>
        row([
          month,
          material,
          accreditationType,
          figures[material][accreditationType].netCredit
        ])
      )
    )
  )

/**
 * @param {ReprocessorExporterTable} table
 * @returns {CsvRow[]}
 */
export const buildReprocessorRows = ({ data }) =>
  Object.entries(data.months).flatMap(([month, { figures }]) =>
    TONNAGE_MONITORING_MATERIALS.map((material) => {
      // Keyed by accreditation type without discriminating on it, so the
      // measures the key stands for are asserted rather than narrowed.
      const f = /** @type {ReprocessorMeasures & PublishedExtras} */ (
        figures[material][WASTE_PROCESSING_TYPE.REPROCESSOR]
      )
      return row([
        month,
        material,
        f.tonnageReceived,
        f.tonnageRecycled,
        f.tonnageReceivedButNotRecycled,
        f.tonnageSentOnTotal,
        f.tonnageSentOnToReprocessor,
        f.tonnageSentOnToExporter,
        f.tonnageSentOnToOtherFacilities,
        f.revisedTonnageIssued,
        f.totalRevenue,
        f.averagePricePerTonne
      ])
    })
  )

/**
 * @param {ReprocessorExporterTable} table
 * @returns {CsvRow[]}
 */
export const buildExporterRows = ({ data }) =>
  Object.entries(data.months).flatMap(([month, { figures }]) =>
    TONNAGE_MONITORING_MATERIALS.map((material) => {
      const f = /** @type {ExporterMeasures & PublishedExtras} */ (
        figures[material][WASTE_PROCESSING_TYPE.EXPORTER]
      )
      return row([
        month,
        material,
        f.tonnageReceived,
        f.tonnageExported,
        f.tonnageReceivedButNotExported,
        f.tonnageSentOnTotal,
        f.tonnageSentOnToReprocessor,
        f.tonnageSentOnToExporter,
        f.tonnageSentOnToOtherFacilities,
        f.tonnageStopped,
        f.tonnageRefused,
        f.tonnageRepatriated,
        f.revisedTonnageIssued,
        f.totalRevenue,
        f.averagePricePerTonne
      ])
    })
  )

/**
 * @param {OutstandingReturnsTable} table
 * @returns {CsvRow[]}
 */
export const buildOutstandingReturnsRows = ({ data }) =>
  Object.entries(data.months).flatMap(([month, { figures }]) =>
    TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
      TONNAGE_BANDS.map((tonnageBand) =>
        row([month, material, tonnageBand, figures[material][tonnageBand]])
      )
    )
  )

/**
 * The one row of the manifest. The zip's filename carries the period and the
 * moment too, but a filename gets renamed and a file inside does not.
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @param {string[]} params.months - the reporting months the export covers, in order
 * @param {string} params.generatedAt - ISO 8601
 * @returns {CsvRow}
 */
export const buildManifestRow = ({
  year,
  cadence,
  period,
  months,
  generatedAt
}) =>
  row([
    year,
    cadence,
    period,
    months[0],
    // Never empty: a period with no ended month is rejected before this runs.
    /** @type {string} */ (months.at(-1)),
    generatedAt
  ])
