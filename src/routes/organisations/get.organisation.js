import { organisationInYear } from '#organisation-read-model/domain/years.js'
import { organisationViewSchema } from './response.schema.js'
import { organisationPath, organisationQuery, viewRoute } from './view-route.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationQuery } from './view-route.js' */

/**
 * @param {Organisation} organisation
 * @param {OrganisationQuery} query
 */
const organisationFor = (organisation, { year }) =>
  year === undefined ? organisation : organisationInYear(organisation, year)

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationViewSchema,
  organisationFor,
  organisationQuery
)
