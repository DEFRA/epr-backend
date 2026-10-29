import { yearSchema } from '#common/validation/year-schema.js'
import { organisationInYear } from '#organisation-read-model/domain/years.js'
import { isRelevantYearOpen } from '#packaging-recycling-notes/domain/closed-year.js'
import { organisationViewSchema } from './response.schema.js'
import { organisationPath, viewRoute } from './view-route.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @typedef {{ year?: Year }} OrganisationQuery */
/** @typedef {{ prns: { open: boolean } }} PrnYearState */

const organisationQuery = { year: yearSchema() }

/**
 * The trading name when there is one, otherwise the company name.
 * @param {Organisation} organisation
 */
const displayNameOf = ({ name, tradingName }) => tradingName?.trim() || name

/**
 * Each accreditation, keyed by its year, with whether PRNs and PERNs are still
 * open for that year.
 * @template {object} A
 * @param {Record<string, A>} accreditations
 * @param {Date} now
 * @returns {Record<string, A & PrnYearState>}
 */
const withPrnYearState = (accreditations, now) =>
  Object.fromEntries(
    Object.entries(accreditations).map(([year, accreditation]) => [
      year,
      {
        ...accreditation,
        prns: { open: isRelevantYearOpen(Number(year), now) }
      }
    ])
  )

/**
 * @param {Organisation['registrations']} registrations
 * @param {Date} now
 */
const registrationsAt = (registrations, now) =>
  Object.fromEntries(
    Object.entries(registrations).map(([number, registration]) => [
      number,
      {
        ...registration,
        accreditations: withPrnYearState(registration.accreditations, now)
      }
    ])
  )

/**
 * @param {Organisation} organisation
 * @param {OrganisationQuery} query
 */
export const organisationFor = (organisation, { year }) => {
  const now = new Date()
  const inYear =
    year === undefined
      ? organisation
      : organisationInYear(organisation, year, now)
  return {
    ...inYear,
    displayName: displayNameOf(organisation),
    registrations: registrationsAt(inYear.registrations, now)
  }
}

export const organisationViewGet = viewRoute(
  organisationPath,
  organisationViewSchema,
  organisationFor,
  organisationQuery
)
