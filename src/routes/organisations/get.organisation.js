import { organisationViewSchema } from './response.schema.js'
import {
  organisationParams,
  organisationPath,
  viewRoute
} from './view-route.js'

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationParams,
  organisationViewSchema,
  (view) => view
)
