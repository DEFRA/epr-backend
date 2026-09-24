import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  byReportingMonth,
  metaSchema,
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
 * A grand total carries no average price: the published workbook prints a dash
 * there, so the page has nothing to round or divide.
 *
 * @param {readonly string[]} measures
 */
const byAccreditationType = (measures) =>
  Joi.object({
    [WASTE_PROCESSING_TYPE.REPROCESSOR]: recordOf(
      [...measures, ...REPROCESSOR_ONLY],
      figure
    )
      .keys(operatorCountKeys)
      .required(),
    [WASTE_PROCESSING_TYPE.EXPORTER]: recordOf(
      [...measures, ...EXPORTER_ONLY],
      figure
    )
      .keys(operatorCountKeys)
      .required()
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
 * Every figure and grand total also carries two operator counts, for the
 * regulators to judge whether it would identify an operator. An operator is a
 * business, and counts once however many sites it has, so one with sites in
 * two nations counts once in each nation and once in the UK.
 *
 * - `operatorCount` is the operators who could have contributed: every
 *   operator owed a report for the month, whether or not it submitted one, and
 *   every operator whose report the figure includes. A suspended operator
 *   counts. One whose accreditation stood cancelled for the whole month does
 *   not, unless the figure includes a report of its all the same, and neither
 *   does one the figures leave out.
 * - `submittingOperatorCount` is the operators whose reports the figure
 *   includes.
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
