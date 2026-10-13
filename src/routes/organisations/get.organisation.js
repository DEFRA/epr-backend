import { organisationViewSchema } from './response.schema.js'
import { organisationPath, viewRoute } from './view-route.js'

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationViewSchema,
  (organisation) => organisation
)
