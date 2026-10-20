import { yearSchema } from '#common/validation/year-schema.js'
import { organisationInYear } from '#organisation-read-model/domain/years.js'
import { organisationViewSchema } from './response.schema.js'
import { organisationPath, viewRoute } from './view-route.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @typedef {{ year?: number }} OrganisationQuery */

const organisationQuery = { year: yearSchema() }

/**
 * The trading name when there is one, otherwise the company name.
 * @param {Organisation} organisation
 */
const displayNameOf = ({ name, tradingName }) => tradingName?.trim() || name

/**
 * @param {Organisation} organisation
 * @param {OrganisationQuery} query
 */
const organisationFor = (organisation, { year }) => ({
  ...(year === undefined
    ? organisation
    : organisationInYear(organisation, year)),
  displayName: displayNameOf(organisation)
})

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationViewSchema,
  organisationFor,
  organisationQuery
)
