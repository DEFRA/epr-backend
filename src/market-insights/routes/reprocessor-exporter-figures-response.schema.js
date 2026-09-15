import Joi from 'joi'

import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'

const REPORTING_MONTH = /^\d{4}-\d{2}$/

/**
 * Every key the publication prints is required, so a material or measure
 * nothing reported into is still served, at zero.
 *
 * @param {readonly string[]} keys
 * @param {Joi.Schema} valueSchema
 */
const recordOf = (keys, valueSchema) =>
  Joi.object(
    Object.fromEntries(keys.map((key) => [key, valueSchema.required()]))
  )

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
    reprocessor: reprocessorFiguresSchema.required(),
    exporter: exporterFiguresSchema.required()
  })
)

/**
 * Response contract for the published UK reprocessor and exporter tables.
 * Keyed by reporting month, then material, then accreditation type, each
 * type carrying the measures its own table prints.
 */
export const reprocessorExporterFiguresResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required()
  }).required(),
  data: Joi.object({
    months: Joi.object()
      .pattern(
        REPORTING_MONTH,
        Joi.object({ figures: figuresByMaterialSchema.required() }).required()
      )
      .required()
  }).required()
})
