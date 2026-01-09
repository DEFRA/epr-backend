import Joi from 'joi'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  accreditationUpdateSchema,
  accreditationSiteSchema
} from './accreditation.js'
import { addressSchema, formFileUploadSchema } from './base.js'
import { yearlyMetricsSchema } from './metrics.js'
import { organisationReplaceSchema } from './organisation.js'
import {
  registrationUpdateSchema,
  registrationSiteSchema,
  exportPortsSchema
} from './registration.js'
import { wasteManagementPermitSchema } from './waste-permits.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion up to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

const fixIdFields = (schema) => {
  const paths = ['id', 'accreditationId'].filter((p) =>
    schema.$_terms.keys?.some((k) => k.key === p)
  )
  return schema.fork(paths, () => Joi.string().required())
}

const nullable = (schema) => schema.allow(null)

const fixDateFields = (schema) =>
  schema.fork(['validFrom', 'validTo'], () =>
    nullable(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)).optional()
  )

const fixedWasteManagementPermitSchema = wasteManagementPermitSchema.fork(
  ['permitNumber', 'exemptions', 'authorisedMaterials'],
  (s) => nullable(s.optional())
)

const applyRegistrationForks = (schema) =>
  schema
    .fork(['registrationNumber', 'validFrom', 'validTo'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['cbduNumber', 'plantEquipmentDetails'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['reprocessingType'], () =>
      nullable(
        Joi.string().valid(REPROCESSING_TYPE.INPUT, REPROCESSING_TYPE.OUTPUT)
      ).optional()
    )
    .fork(['site'], () => nullable(registrationSiteSchema).optional())
    .fork(['noticeAddress'], () => nullable(addressSchema).optional())
    .fork(['wasteManagementPermits'], () =>
      nullable(Joi.array().items(fixedWasteManagementPermitSchema)).optional()
    )
    .fork(['yearlyMetrics'], () =>
      nullable(Joi.array().items(yearlyMetricsSchema)).optional()
    )
    .fork(['exportPorts'], () => nullable(exportPortsSchema).optional())
    .fork(['orsFileUploads', 'samplingInspectionPlanPart1FileUploads'], () =>
      nullable(Joi.array().items(formFileUploadSchema)).optional()
    )
    .fork(['glassRecyclingProcess'], () =>
      nullable(
        Joi.array().items(
          Joi.string().valid(
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          )
        )
      ).optional()
    )

const applyRegistrationConditions = (schema) =>
  schema
    .fork(['site'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required()
      })
    )
    .fork(['wasteManagementPermits'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.array().min(1).required()
      })
    )
    .fork(['yearlyMetrics', 'plantEquipmentDetails'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
    )
    .fork(['noticeAddress'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.required()
      })
    )
    .fork(['reprocessingType'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.forbidden()
      })
    )
    .fork(['exportPorts', 'orsFileUploads'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.array().required(),
        otherwise: Joi.forbidden()
      })
    )
    .fork(['glassRecyclingProcess'], (s) =>
      s.when(Joi.ref('material'), {
        is: MATERIAL.GLASS,
        then: Joi.array().required(),
        otherwise: Joi.valid(null).optional()
      })
    )
    .fork(['cbduNumber'], (s) =>
      s.when(Joi.ref('submittedToRegulator'), {
        is: Joi.valid(REGULATOR.EA, REGULATOR.SEPA, REGULATOR.NRW),
        then: Joi.string().required()
      })
    )
    .fork(['registrationNumber', 'validFrom', 'validTo'], (s) =>
      s.when(Joi.ref('status'), {
        is: Joi.valid(REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED),
        then: Joi.required()
      })
    )

const fixRegistration = (schema) => {
  let fixed = fixIdFields(schema)
  fixed = applyRegistrationForks(fixed)
  fixed = fixDateFields(fixed)

  return applyRegistrationConditions(fixed)
}

const applyAccreditationForks = (schema) =>
  schema
    .fork(['accreditationNumber', 'validFrom', 'validTo'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['reprocessingType'], () =>
      nullable(
        Joi.string().valid(REPROCESSING_TYPE.INPUT, REPROCESSING_TYPE.OUTPUT)
      ).optional()
    )
    .fork(['glassRecyclingProcess'], () =>
      nullable(
        Joi.array().items(
          Joi.string().valid(
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          )
        )
      ).optional()
    )
    .fork(['orsFileUploads', 'samplingInspectionPlanPart2FileUploads'], () =>
      nullable(Joi.array().items(formFileUploadSchema)).optional()
    )
    .fork(['site'], () => nullable(accreditationSiteSchema).optional())

const applyAccreditationConditions = (schema) =>
  schema
    .fork(['site'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required()
      })
    )
    .fork(['reprocessingType'], (s) =>
      s.when(Joi.ref('wasteProcessingType'), {
        is: WASTE_PROCESSING_TYPE.EXPORTER,
        then: Joi.forbidden()
      })
    )
    .fork(['accreditationNumber', 'validFrom', 'validTo'], (s) =>
      s.when(Joi.ref('status'), {
        is: Joi.valid(REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED),
        then: Joi.required()
      })
    )

const fixAccreditation = (schema) => {
  let fixed = fixIdFields(schema)
  fixed = applyAccreditationForks(fixed)
  fixed = fixDateFields(fixed)

  return applyAccreditationConditions(fixed)
}

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(fixRegistration(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(fixAccreditation(accreditationUpdateSchema))
    .default([])
})
