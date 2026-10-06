import {
  accreditationViewSchema,
  accreditationsViewResponseSchema
} from './response.schema.js'
import {
  accreditationParams,
  accreditationPath,
  accreditationsPath,
  found,
  registration,
  registrationParams,
  viewRoute
} from './view-route.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { AccreditationParams, RegistrationParams } from './view-route.js' */

/**
 * @param {Organisation} organisation
 * @param {RegistrationParams} params
 */
const accreditations = (organisation, params) => ({
  accreditations: registration(organisation, params).accreditations
})

/**
 * @param {Organisation} organisation
 * @param {AccreditationParams} params
 */
const accreditation = (organisation, params) =>
  found(
    registration(organisation, params).accreditations,
    params.year,
    'Accreditation'
  )

export const accreditationsViewGet = viewRoute(
  accreditationsPath,
  registrationParams,
  accreditationsViewResponseSchema,
  accreditations
)

export const accreditationViewGet = viewRoute(
  accreditationPath,
  accreditationParams,
  accreditationViewSchema,
  accreditation
)
