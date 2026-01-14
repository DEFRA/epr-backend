import Joi from 'joi'
import {
  GLASS_RECYCLING_PROCESS,
  REPROCESSING_TYPE,
} from '#domain/organisations/model.js'
import { accreditationUpdateSchema } from './accreditation.js'
import { organisationReplaceSchema } from './organisation.js'
import { registrationUpdateSchema } from './registration.js'

/**
 * Joi schema overrides for JSON Schema compatibility.
 * These overrides fork the original domain schemas to resolve issues during
 * conversion to JSON Schema, such as incompatible types or complex
 * conditional logic that does not translate directly.
 */

const nullable = (schema) => schema.allow(null)

const applyRegistrationForks = (schema) =>
  schema
    .fork(['registrationNumber', 'validFrom', 'validTo'], () =>
      nullable(Joi.string()).optional()
    )
    .fork(['reprocessingType'], () =>
      nullable(
        Joi.string().valid(REPROCESSING_TYPE.INPUT, REPROCESSING_TYPE.OUTPUT)
      ).optional()
    )


const fixRegistration = (schema) => {
  return applyRegistrationForks(schema)
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

const fixAccreditation = (schema) => {
  return applyAccreditationForks(schema)
}

export const organisationJSONSchemaOverrides = organisationReplaceSchema.keys({
  registrations: Joi.array()
    .items(fixRegistration(registrationUpdateSchema))
    .default([]),
  accreditations: Joi.array()
    .items(fixAccreditation(accreditationUpdateSchema))
    .default([])
})
