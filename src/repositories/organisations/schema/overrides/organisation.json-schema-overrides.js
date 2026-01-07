import Joi from 'joi'
import {
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { accreditationUpdateSchema } from '../accreditation.js'
import { addressSchema, formFileUploadSchema } from '../base.js'
import { yearlyMetricsSchema } from '../metrics.js'
import { organisationReplaceSchema } from '../organisation.js'
import { registrationUpdateSchema } from '../registration.js'
import { wasteManagementPermitSchema } from '../waste-permits.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion up to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

const fixIdFields = (schema) => {
  const paths = ['id', 'accreditationId'].filter((p) =>
    schema.$_terms.keys.some((k) => k.key === p)
  )
  return schema.fork(paths, () => Joi.string().optional())
}

const nullable = (schema) => Joi.alternatives().try(schema, Joi.valid(null))

const fixDateFields = (schema) =>
  schema.fork(['validFrom', 'validTo'], () =>
    nullable(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)).optional()
  )

const siteCapacitySchema = Joi.object({
  material: Joi.string().required(),
  siteCapacityInTonnes: Joi.number().required(),
  siteCapacityTimescale: Joi.string().required()
})

const siteAddressSchema = addressSchema.fork(['line1', 'postcode'], (schema) =>
  schema.required()
)

const registrationSiteSchema = Joi.object({
  address: siteAddressSchema.required(),
  gridReference: Joi.string().required(),
  siteCapacity: Joi.array().items(siteCapacitySchema).required().min(1)
})

const accreditationSiteSchema = Joi.object({
  address: Joi.object({
    line1: Joi.string().required(),
    postcode: Joi.string().required()
  })
})

const fixedWasteManagementPermitSchema = wasteManagementPermitSchema.fork(
  ['permitNumber', 'exemptions', 'authorisedMaterials'],
  (s) => nullable(s.optional())
)

const fixRegistration = (schema) => {
  let fixed = fixIdFields(schema)
  fixed = fixDateFields(fixed)

  return fixed
    .fork(['registrationNumber', 'validFrom', 'validTo'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['cbduNumber', 'plantEquipmentDetails'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['reprocessingType'], () =>
      nullable(Joi.string().valid('input', 'output')).optional()
    )
    .fork(['site'], () => nullable(registrationSiteSchema).optional())
    .fork(['noticeAddress'], () => nullable(addressSchema).optional())
    .fork(['wasteManagementPermits'], () =>
      nullable(Joi.array().items(fixedWasteManagementPermitSchema)).optional()
    )
    .fork(['yearlyMetrics'], () =>
      nullable(Joi.array().items(yearlyMetricsSchema)).optional()
    )
    .fork(['exportPorts'], () =>
      nullable(Joi.array().items(Joi.string())).optional()
    )
    .fork(['orsFileUploads', 'samplingInspectionPlanPart1FileUploads'], () =>
      nullable(Joi.array().items(formFileUploadSchema)).optional()
    )
    .fork(['glassRecyclingProcess'], () =>
      nullable(Joi.array().items(Joi.string())).optional()
    )
    .when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: Joi.object({
        site: Joi.required(),
        wasteManagementPermits: Joi.array().min(1).required(),
        yearlyMetrics: Joi.array().required(),
        plantEquipmentDetails: Joi.string().required()
      }),
      otherwise: Joi.object({
        yearlyMetrics: Joi.forbidden(),
        plantEquipmentDetails: Joi.forbidden()
      })
    })
    .when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.EXPORTER,
      then: Joi.object({
        noticeAddress: Joi.required(),
        reprocessingType: Joi.forbidden(),
        exportPorts: Joi.array().required(),
        orsFileUploads: Joi.array().required()
      }),
      otherwise: Joi.object({
        exportPorts: Joi.forbidden(),
        orsFileUploads: Joi.forbidden()
      })
    })
    .when('material', {
      is: MATERIAL.GLASS,
      then: Joi.object({
        glassRecyclingProcess: Joi.array().required()
      }),
      otherwise: Joi.object({
        glassRecyclingProcess: Joi.valid(null)
      })
    })
    .when('submittedToRegulator', {
      is: Joi.valid(REGULATOR.EA, REGULATOR.SEPA, REGULATOR.NRW),
      then: Joi.object({
        cbduNumber: Joi.string().required()
      })
    })
    .when('status', {
      is: Joi.valid(REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED),
      then: Joi.object({
        registrationNumber: Joi.string().required(),
        validFrom: Joi.string().required(),
        validTo: Joi.string().required()
      })
    })
}

const fixAccreditation = (schema) => {
  let fixed = fixIdFields(schema)
  fixed = fixDateFields(fixed)

  return fixed
    .fork(['accreditationNumber', 'validFrom', 'validTo'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['reprocessingType'], () =>
      nullable(Joi.string().valid('input', 'output')).optional()
    )
    .fork(['glassRecyclingProcess'], () =>
      nullable(Joi.array().items(Joi.string())).optional()
    )
    .fork(['orsFileUploads', 'samplingInspectionPlanPart2FileUploads'], () =>
      nullable(Joi.array().items(formFileUploadSchema)).optional()
    )
    .fork(['site'], () => nullable(accreditationSiteSchema).optional())
    .when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: Joi.object({
        site: Joi.required()
      }).when('status', {
        is: Joi.valid(REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED),
        then: Joi.object({
          reprocessingType: Joi.string().required()
        })
      })
    })
    .when('wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.EXPORTER,
      then: Joi.object({
        reprocessingType: Joi.forbidden()
      })
    })
    .when('status', {
      is: Joi.valid(REG_ACC_STATUS.APPROVED, REG_ACC_STATUS.SUSPENDED),
      then: Joi.object({
        accreditationNumber: Joi.string().required(),
        validFrom: Joi.string().required(),
        validTo: Joi.string().required()
      })
    })
}

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(fixRegistration(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(fixAccreditation(accreditationUpdateSchema))
    .default([])
})
