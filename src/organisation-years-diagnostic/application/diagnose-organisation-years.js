import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'
import {
  organisationYears,
  approvedYears,
  firstApprovedAt
} from '#organisation-read-model/vocabulary.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation, RegistrationStatus } from '#organisation-read-model/vocabulary.js' */

/**
 * @typedef {Object} OtherYearRegistration
 * @property {string} registrationId
 * @property {RegistrationStatus} status
 * @property {string | undefined} firstApprovedAt
 * @property {Year[]} years
 */

/**
 * @typedef {Object} OrganisationYearsRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {Year[]} years
 * @property {OtherYearRegistration[]} registrations
 */

/**
 * @typedef {Object} OrganisationYearsSummary
 * @property {Year} openYear
 * @property {number} scannedOrganisations
 * @property {number} organisationsWithOtherYears
 * @property {number} otherYearsInTestOrganisations
 * @property {number} organisationsWithNoYear
 * @property {Record<string, number>} organisationsByYear
 */

/**
 * @typedef {Object} OrganisationYearsReport
 * @property {OrganisationYearsRow[]} rows
 * @property {OrganisationYearsSummary} summary
 */

/**
 * Lists every organisation whose years, as `GET /organisations/{n}/years`
 * serves them, include a year other than `openYear`, with the registrations
 * that bring those years in.
 *
 * @param {Organisation[]} organisations
 * @param {Year} openYear
 * @returns {OrganisationYearsReport}
 */
export const diagnoseOrganisationYears = (organisations, openYear) => {
  const scanned = organisations.map((organisation) => ({
    organisation,
    years: organisationYears(organisation, openYear)
  }))

  const organisationsByYear = scanned
    .flatMap(({ years }) => years)
    .reduce(
      (counts, year) => ({ ...counts, [year]: (counts[year] ?? 0) + 1 }),
      /** @type {Record<string, number>} */ ({})
    )

  const rows = scanned
    .filter(({ years }) => years.some((year) => year !== openYear))
    .map(({ organisation, years }) => ({
      organisationNumber: organisation.organisationNumber,
      testOrganisation: isTestOrganisation(organisation),
      years,
      registrations: Object.entries(organisation.registrations)
        .map(([registrationId, { status }]) => ({
          registrationId,
          status: status.current,
          firstApprovedAt: firstApprovedAt(status.timeline),
          years: approvedYears(status.timeline, openYear)
        }))
        .filter((registration) =>
          registration.years.some((year) => year !== openYear)
        )
    }))

  return {
    rows,
    summary: {
      openYear,
      scannedOrganisations: organisations.length,
      organisationsWithOtherYears: rows.length,
      otherYearsInTestOrganisations: rows.filter((row) => row.testOrganisation)
        .length,
      organisationsWithNoYear: scanned.filter(({ years }) => years.length === 0)
        .length,
      organisationsByYear
    }
  }
}
