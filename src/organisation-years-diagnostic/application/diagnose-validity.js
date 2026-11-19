import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { nextYear, utcYearOf, yearBounds } from '#common/helpers/dates/year.js'
import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} RegistrationValidityRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {string} status
 * @property {string} validFrom
 */

/**
 * @typedef {Object} AccreditationValidityRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {string} status
 * @property {string | undefined} validFrom
 * @property {string | undefined} validTo
 */

/**
 * @typedef {Object} ValiditySummary
 * @property {Year} year
 * @property {number} scannedRegistrations
 * @property {number} registrationsStartingBefore
 * @property {number} scannedAccreditations
 * @property {number} accreditationsStartingBefore
 * @property {number} accreditationsEndingAfter
 * @property {number} accreditationsEndingOnFirstJanuary
 * @property {number} rowsInTestOrganisations
 */

/**
 * @typedef {Object} ValidityReport
 * @property {RegistrationValidityRow[]} registrations
 * @property {AccreditationValidityRow[]} accreditations
 * @property {ValiditySummary} summary
 */

/**
 * Stored documents can hold `null` where the type has no date.
 *
 * @param {string | null | undefined} date
 * @param {(dateYear: Year) => boolean} predicate
 */
const yearMatches = (date, predicate) =>
  date ? predicate(utcYearOf(date)) : false

/** @param {string | null | undefined} date */
const dayOf = (date) => {
  const instant = new Date(date ?? Number.NaN)
  return date && !Number.isNaN(instant.getTime())
    ? utcCalendarDate(instant)
    : undefined
}

/**
 * Lists every stored registration whose `validFrom` falls before `year`, and
 * every stored accreditation whose `validFrom` falls before it or whose
 * `validTo` falls after 1 January of the next year, whatever their number or
 * status. A `validTo` of exactly 1 January is only counted: the accreditation
 * year comes from `validFrom`, so that date does not move it into the next
 * year.
 *
 * @param {Organisation[]} organisations
 * @param {Year} year
 * @returns {ValidityReport}
 */
export const diagnoseValidity = (organisations, year) => {
  const before = (/** @type {Year} */ dateYear) => dateYear < year
  const firstJanuary = yearBounds(nextYear(year)).start
  const endsAfter = (/** @type {string | null | undefined} */ validTo) => {
    const day = dayOf(validTo)
    return day !== undefined && day > firstJanuary
  }

  const registrations = organisations.flatMap((organisation) =>
    organisation.registrations
      .filter(({ validFrom }) => yearMatches(validFrom, before))
      .map((registration) => ({
        organisationNumber: organisation.organisationNumber,
        testOrganisation: isTestOrganisation(organisation),
        registrationId: registration.id,
        registrationNumber: registration.registrationNumber,
        status: registration.status,
        validFrom: /** @type {string} */ (registration.validFrom)
      }))
  )

  const accreditations = organisations.flatMap((organisation) =>
    organisation.accreditations
      .filter(
        ({ validFrom, validTo }) =>
          yearMatches(validFrom, before) || endsAfter(validTo)
      )
      .map((accreditation) => ({
        organisationNumber: organisation.organisationNumber,
        testOrganisation: isTestOrganisation(organisation),
        accreditationId: accreditation.id,
        accreditationNumber: accreditation.accreditationNumber,
        status: accreditation.status,
        validFrom: accreditation.validFrom,
        validTo: accreditation.validTo
      }))
  )

  return {
    registrations,
    accreditations,
    summary: {
      year,
      scannedRegistrations: organisations.flatMap(
        ({ registrations: all }) => all
      ).length,
      registrationsStartingBefore: registrations.length,
      scannedAccreditations: organisations.flatMap(
        ({ accreditations: all }) => all
      ).length,
      accreditationsStartingBefore: accreditations.filter(({ validFrom }) =>
        yearMatches(validFrom, before)
      ).length,
      accreditationsEndingAfter: accreditations.filter(({ validTo }) =>
        endsAfter(validTo)
      ).length,
      accreditationsEndingOnFirstJanuary: organisations
        .flatMap(({ accreditations: all }) => all)
        .filter(({ validTo }) => dayOf(validTo) === firstJanuary).length,
      rowsInTestOrganisations: [...registrations, ...accreditations].filter(
        (row) => row.testOrganisation
      ).length
    }
  }
}
