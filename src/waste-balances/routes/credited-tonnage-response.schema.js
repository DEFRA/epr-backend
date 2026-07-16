import Joi from 'joi'

/**
 * Response contract for the credited-tonnage report. The admin frontend builds
 * its table and CSV against these exact field names.
 */
export const creditedTonnageResponseSchema = Joi.object({
  meta: Joi.object({
    generatedAt: Joi.string().isoDate().required()
  }).required(),
  data: Joi.array()
    .items(
      Joi.object({
        month: Joi.string()
          .pattern(/^\d{4}-\d{2}$/)
          .required(),
        organisation: Joi.object({
          id: Joi.string().required(),
          reference: Joi.string().required()
        }).required(),
        accreditation: Joi.object({
          id: Joi.string().required(),
          accreditationNumber: Joi.string().allow('').required(),
          processingType: Joi.string()
            .valid('reprocessor', 'exporter')
            .required(),
          material: Joi.string().required()
        }).required(),
        tonnage: Joi.object({
          totalCredited: Joi.number().required(),
          eligibleForWasteBalance: Joi.number().required(),
          sentOnDeductions: Joi.number().required()
        }).required()
      })
    )
    .required()
})
