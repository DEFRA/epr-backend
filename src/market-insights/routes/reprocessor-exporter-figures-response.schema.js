import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  byReportingMonth,
  metaSchema,
  operatorCount,
  operatorCountKeys,
  recordOf,
  reportCountSchema
} from './response-schema.js'

const figure = Joi.number()

const TOTALLED_MEASURES = [
  'tonnageReceived',
  'tonnageSentOnTotal',
  'tonnageSentOnToReprocessor',
  'tonnageSentOnToExporter',
  'tonnageSentOnToOtherFacilities',
  'revisedTonnageIssued',
  'totalRevenue'
]

const REPROCESSOR_ONLY = ['tonnageRecycled', 'tonnageReceivedButNotRecycled']

const EXPORTER_ONLY = [
  'tonnageExported',
  'tonnageReceivedButNotExported',
  'tonnageStopped',
  'tonnageRefused',
  'tonnageRepatriated'
]

/**
 * @param {readonly string[]} figures
 */
const withOperatorCounts = (figures) =>
  recordOf(figures, figure)
    .keys({
      ...operatorCountKeys,
      contributingOperatorCounts: recordOf(figures, operatorCount).required()
    })
    .required()

/**
 * A grand total carries no average price: the published workbook prints a dash
 * there, so the page has nothing to round or divide.
 *
 * @param {readonly string[]} measures
 */
const byAccreditationType = (measures) =>
  Joi.object({
    [WASTE_PROCESSING_TYPE.REPROCESSOR]: withOperatorCounts([
      ...measures,
      ...REPROCESSOR_ONLY
    ]),
    [WASTE_PROCESSING_TYPE.EXPORTER]: withOperatorCounts([
      ...measures,
      ...EXPORTER_ONLY
    ])
  })

const figuresByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  byAccreditationType([...TOTALLED_MEASURES, 'averagePricePerTonne'])
)

const totalsSchema = byAccreditationType(TOTALLED_MEASURES)

/**
 * Response contract for the published UK reprocessor and exporter tables.
 * Keyed by reporting month, then material, then accreditation type, each
 * type carrying the measures its own table prints, plus the grand total each
 * table ends in. Each month says how many monthly reports it was owed and how
 * many have been submitted, and the period carries the sum, so a page can say
 * how complete the figures are. That count covers the registrations these
 * figures cover, those holding a live accreditation, which is a narrower
 * population than the waste balance counts over.
 *
 * Every row of figures and grand total also carries operator counts, for the
 * regulators to judge whether each figure would identify an operator. An
 * operator is a business, and counts once however many sites it has, so one
 * with sites in two nations counts once in each nation and once in the UK.
 *
 * - `operatorCount` is the operators who could have contributed: every
 *   operator owed a report for the month, whether or not it submitted one, and
 *   every operator whose report the figure includes. A suspended operator
 *   counts. One whose accreditation stood cancelled for the whole month does
 *   not, unless the figure includes a report of its all the same, and neither
 *   does one the figures leave out.
 * - `submittingOperatorCount` is the operators whose reports the figure
 *   includes.
 * - `contributingOperatorCounts` holds, for each figure in the row, the
 *   operators whose reports put something other than zero into it. The
 *   sent-on total takes from any report that sent something on, and the
 *   average price from any that reported revenue or revised tonnage.
 */
export const reprocessorExporterFiguresResponseSchema = Joi.object({
  meta: metaSchema,
  data: Joi.object({
    months: byReportingMonth(
      Joi.object({
        reports: reportCountSchema.required(),
        figures: figuresByMaterialSchema.required(),
        totals: totalsSchema.required()
      })
    ),
    period: Joi.object({ reports: reportCountSchema.required() }).required()
  }).required()
})
