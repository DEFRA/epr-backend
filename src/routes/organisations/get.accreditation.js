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

/** @import { OrganisationView } from './organisation-view.js' */
/** @import { AccreditationParams, RegistrationParams } from './view-route.js' */

/**
 * @param {OrganisationView} view
 * @param {RegistrationParams} params
 */
const accreditations = (view, params) => ({
  accreditations: registration(view, params).accreditations
})

/**
 * @param {OrganisationView} view
 * @param {AccreditationParams} params
 */
const accreditation = (view, params) =>
  found(registration(view, params).accreditations, params.year, 'Accreditation')

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
