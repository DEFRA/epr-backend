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

const SHARED_MEASURES = [
  'tonnageReceived',
  'tonnageSentOnTotal',
  'tonnageSentOnToReprocessor',
  'tonnageSentOnToExporter',
  'tonnageSentOnToOtherFacilities',
  'revisedTonnageIssued',
  'totalRevenue',
  'averagePricePerTonne'
]

const reprocessorFiguresSchema = recordOf(
  [...SHARED_MEASURES, 'tonnageRecycled', 'tonnageReceivedButNotRecycled'],
  figure
)

const exporterFiguresSchema = recordOf(
  [
    ...SHARED_MEASURES,
    'tonnageExported',
    'tonnageReceivedButNotExported',
    'tonnageStopped',
    'tonnageRefused',
    'tonnageRepatriated'
  ],
  figure
)

const figuresByMaterialSchema = recordOf(
  TONNAGE_MONITORING_MATERIALS,
  Joi.object({
    [WASTE_PROCESSING_TYPE.REPROCESSOR]: reprocessorFiguresSchema.required(),
    [WASTE_PROCESSING_TYPE.EXPORTER]: exporterFiguresSchema.required()
  })
)

/**
 * Response contract for the published UK reprocessor and exporter tables.
 * Keyed by reporting month, then material, then accreditation type, each
 * type carrying the measures its own table prints. Each month says how many
 * monthly reports it was owed and how many have been submitted, and the
 * period carries the sum, so a page can say how complete the figures are.
 */
export const reprocessorExporterFiguresResponseSchema = Joi.object({
  meta: metaSchema,
  data: Joi.object({
    months: byReportingMonth(
      Joi.object({
        reports: reportCountSchema.required(),
        figures: figuresByMaterialSchema.required()
      })
    ),
    period: Joi.object({ reports: reportCountSchema.required() }).required()
  }).required()
})
