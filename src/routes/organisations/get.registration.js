import {
  registrationViewSchema,
  registrationsViewResponseSchema
} from './response.schema.js'
import {
  organisationParams,
  registration,
  registrationParams,
  registrationPath,
  registrationsPath,
  viewRoute
} from './view-route.js'

export const registrationsViewGet = viewRoute(
  registrationsPath,
  organisationParams,
  registrationsViewResponseSchema,
  (organisation) => ({ registrations: organisation.registrations })
)

export const registrationViewGet = viewRoute(
  registrationPath,
  registrationParams,
  registrationViewSchema,
  registration
)
