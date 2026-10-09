import { organisationYears } from '#organisation-read-model/domain/years.js'
import { organisationYearsResponseSchema } from './response.schema.js'
import { organisationParams, viewRoute, yearsPath } from './view-route.js'

export const organisationYearsGet = viewRoute(
  yearsPath,
  organisationParams,
  organisationYearsResponseSchema,
  (organisation) => ({ years: organisationYears(organisation) })
)
