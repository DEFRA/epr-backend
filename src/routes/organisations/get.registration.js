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
  (view) => ({ registrations: view.registrations })
)

export const registrationViewGet = viewRoute(
  registrationPath,
  registrationParams,
  registrationViewSchema,
  registration
)
