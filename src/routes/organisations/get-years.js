import { organisationYears } from '#organisation-read-model/domain/years.js'
import { organisationYearsResponseSchema } from './response.schema.js'
import { viewRoute, yearsPath } from './view-route.js'

export const organisationYearsGet = viewRoute(
  yearsPath,
  organisationYearsResponseSchema,
  (organisation) => ({
    years: organisationYears(organisation, new Date())
  })
)
