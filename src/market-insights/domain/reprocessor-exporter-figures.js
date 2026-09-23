import {
  addRounded,
  greaterThan,
  roundToTwoDecimalPlaces,
  subtract,
  toDecimal,
  toNumber
} from '#common/helpers/decimal-utils.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/**
 * @typedef {import('#domain/organisations/model.js').WasteProcessingTypeValue} WasteProcessingTypeValue
 */

/**
 * The parts of a submitted report the figures are read from.
 *
 * @typedef {Pick<import('#reports/repository/port.js').ReportSummary,
 *   'recyclingActivity' | 'exportActivity' | 'wasteSent' | 'prn'>} ReportedActivity
 */

/**
 * The measures both published tables sum: what came in, where it was sent on,
 * and the PRN or PERN tonnage and revenue. Revised tonnage is issued tonnage
 * less self-issued, which the analysts' extract calls "Revised Tonnage
 * PRNs/PERNs issued".
 *
 * @typedef {Object} SharedMeasures
 * @property {number} tonnageReceived
 * @property {number} tonnageSentOnToReprocessor
 * @property {number} tonnageSentOnToExporter
 * @property {number} tonnageSentOnToOtherFacilities
 * @property {number} revisedTonnageIssued
 * @property {number} totalRevenue
 */

/**
 * @typedef {SharedMeasures & {
 *   tonnageRecycled: number,
 *   tonnageReceivedButNotRecycled: number
 * }} ReprocessorMeasures
 */

/**
 * @typedef {SharedMeasures & {
 *   tonnageExported: number,
 *   tonnageReceivedButNotExported: number,
 *   tonnageStopped: number,
 *   tonnageRefused: number,
 *   tonnageRepatriated: number
 * }} ExporterMeasures
 */

/** @typedef {ReprocessorMeasures | ExporterMeasures} Measures */

/**
 * A summed measure record as published: the sent-on total the splits add back
 * to, and the average price per tonne.
 *
 * @typedef {{ tonnageSentOnTotal: number, averagePricePerTonne: number }} PublishedExtras
 * @typedef {Measures & PublishedExtras} PublishedFigures
 */

/**
 * A grand total row as published. It carries no average price: the work
 * instruction tells the analysts not to calculate one for a total, and the
 * published workbook prints a dash there in every table and month.
 *
 * @typedef {Measures & { tonnageSentOnTotal: number }} PublishedTotal
 */

/**
 * @param {ReportedActivity} report
 * @returns {SharedMeasures}
 */
const sharedMeasuresOf = (report) => ({
  tonnageReceived: roundToTwoDecimalPlaces(
    report.recyclingActivity?.totalTonnageReceived
  ),
  tonnageSentOnToReprocessor: roundToTwoDecimalPlaces(
    report.wasteSent?.tonnageSentToReprocessor
  ),
  tonnageSentOnToExporter: roundToTwoDecimalPlaces(
    report.wasteSent?.tonnageSentToExporter
  ),
  tonnageSentOnToOtherFacilities: roundToTwoDecimalPlaces(
    report.wasteSent?.tonnageSentToAnotherSite
  ),
  revisedTonnageIssued: roundToTwoDecimalPlaces(
    subtract(report.prn?.issuedTonnage ?? 0, report.prn?.freeTonnage ?? 0)
  ),
  totalRevenue: roundToTwoDecimalPlaces(report.prn?.totalRevenue)
})

/**
 * @param {ReportedActivity} report
 * @returns {ReprocessorMeasures}
 */
const reprocessorMeasuresOf = (report) => ({
  ...sharedMeasuresOf(report),
  tonnageRecycled: roundToTwoDecimalPlaces(
    report.recyclingActivity?.tonnageRecycled
  ),
  tonnageReceivedButNotRecycled: roundToTwoDecimalPlaces(
    report.recyclingActivity?.tonnageNotRecycled
  )
})

/**
 * @param {ReportedActivity} report
 * @returns {ExporterMeasures}
 */
const exporterMeasuresOf = (report) => ({
  ...sharedMeasuresOf(report),
  tonnageExported: roundToTwoDecimalPlaces(
    report.exportActivity?.totalTonnageExported
  ),
  tonnageReceivedButNotExported: roundToTwoDecimalPlaces(
    report.exportActivity?.tonnageReceivedNotExported
  ),
  tonnageStopped: roundToTwoDecimalPlaces(
    report.exportActivity?.tonnageStoppedDuringExport
  ),
  tonnageRefused: roundToTwoDecimalPlaces(
    report.exportActivity?.tonnageRefusedAtDestination
  ),
  tonnageRepatriated: roundToTwoDecimalPlaces(
    report.exportActivity?.tonnageRepatriated
  )
})

/**
 * The measures one submitted monthly report contributes, read as the
 * accreditation's type reports them. A measure the report has not filled in
 * contributes zero.
 *
 * @param {ReportedActivity} report
 * @param {WasteProcessingTypeValue} accreditationType
 * @returns {Measures}
 */
export const measuresOf = (report, accreditationType) =>
  accreditationType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? reprocessorMeasuresOf(report)
    : exporterMeasuresOf(report)

/**
 * Every measure of the accreditation type, at zero.
 *
 * @param {WasteProcessingTypeValue} accreditationType
 * @returns {Measures}
 */
export const noMeasures = (accreditationType) =>
  measuresOf({}, accreditationType)

/**
 * @template {Measures} T
 * @param {T} a
 * @param {T} b
 * @returns {T}
 */
export const addMeasures = (a, b) => {
  const addend = /** @type {Record<string, number>} */ (b)
  return /** @type {T} */ (
    Object.fromEntries(
      Object.entries(a).map(([measure, value]) => [
        measure,
        toNumber(addRounded(value, addend[measure], 2))
      ])
    )
  )
}

/**
 * The one place the published average price is defined: total revenue over
 * total revised tonnage, summed across operators before dividing, as the
 * analysts do at work instruction steps 21 and 51. Never a mean of each
 * operator's own average. Nothing issued answers zero rather than an error.
 *
 * @param {number} totalRevenue
 * @param {number} revisedTonnageIssued
 * @returns {number}
 */
export const averagePricePerTonne = (totalRevenue, revisedTonnageIssued) =>
  greaterThan(revisedTonnageIssued, 0)
    ? roundToTwoDecimalPlaces(
        toDecimal(totalRevenue).div(toDecimal(revisedTonnageIssued))
      )
    : 0

/**
 * @template {Measures} T
 * @param {T} measures
 * @returns {T & { tonnageSentOnTotal: number }}
 */
export const withSentOnTotal = (measures) => ({
  ...measures,
  tonnageSentOnTotal: toNumber(
    [
      measures.tonnageSentOnToReprocessor,
      measures.tonnageSentOnToExporter,
      measures.tonnageSentOnToOtherFacilities
    ].reduce((sum, split) => addRounded(sum, split, 2), toDecimal(0))
  )
})

/**
 * @template {Measures} T
 * @param {T} measures
 * @returns {T & PublishedExtras}
 */
export const withPublishedFigures = (measures) => ({
  ...withSentOnTotal(measures),
  averagePricePerTonne: averagePricePerTonne(
    measures.totalRevenue,
    measures.revisedTonnageIssued
  )
})

const SENT_ON_SPLITS = [
  'tonnageSentOnToReprocessor',
  'tonnageSentOnToExporter',
  'tonnageSentOnToOtherFacilities'
]

const AVERAGE_PRICE_INPUTS = ['totalRevenue', 'revisedTonnageIssued']

/**
 * The published figures one report's measures put something into. A measure
 * reported as zero puts nothing in, so where one operator reports a figure and
 * others report zero, that figure is the one operator's alone. A figure worked
 * out from others, the sent-on total and the average price, takes something
 * from any report that put something into one of the figures it is worked out
 * from.
 *
 * @param {Measures} measures
 * @returns {string[]}
 */
export const figuresContributedTo = (measures) => {
  const contributed = Object.entries(measures)
    .filter(([, value]) => value !== 0)
    .map(([measure]) => measure)
  /** @param {string[]} inputs */
  const anyOf = (inputs) => inputs.some((input) => contributed.includes(input))
  return [
    ...contributed,
    ...(anyOf(SENT_ON_SPLITS) ? ['tonnageSentOnTotal'] : []),
    ...(anyOf(AVERAGE_PRICE_INPUTS) ? ['averagePricePerTonne'] : [])
  ]
}
