import Joi from 'joi'

import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  byReportingMonth,
  metaSchema,
  recordOf,
  reportCountSchema
} from './response-schema.js'

const figure = Joi.number()

const operatorCount = Joi.number().integer().min(0).required()

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
      .keys({ operatorCount })
      .required(),
    [WASTE_PROCESSING_TYPE.EXPORTER]: recordOf(
      [...measures, ...EXPORTER_ONLY],
      figure
    )
      .keys({ operatorCount })
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
 * population than the waste balance counts over. Every figure and grand total
 * also carries how many separate operators it is built from.
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
