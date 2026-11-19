import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { nextYear, yearBounds } from '#common/helpers/dates/year.js'
import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, StoredAccreditationStatus, StoredRegistrationStatus } from '#domain/organisations/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} RegistrationValidityRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} registrationId
 * @property {string | null} registrationNumber
 * @property {StoredRegistrationStatus} status
 * @property {string} validFrom
 */

/**
 * @typedef {Object} AccreditationValidityRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} accreditationId
 * @property {string | null} accreditationNumber
 * @property {StoredAccreditationStatus} status
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
 * @property {number} unparseableDates
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
 */
const dayOf = (date) => {
  const instant = new Date(date ?? Number.NaN)
  return date && !Number.isNaN(instant.getTime())
    ? utcCalendarDate(instant)
    : undefined
}

/** @param {string | null | undefined} date */
const unparseable = (date) => Boolean(date) && dayOf(date) === undefined

/**
 * Lists every stored registration whose `validFrom` falls before `year`, and
 * every stored accreditation whose `validFrom` falls before it or whose
 * `validTo` falls after 1 January of the next year, whatever their number or
 * status. A `validTo` of exactly 1 January is only counted: the accreditation
 * year comes from `validFrom`, so that date does not move it into the next
 * year. A date that is present but does not parse is listed and counted.
 *
 * @param {Organisation[]} organisations
 * @param {Year} year
 * @returns {ValidityReport}
 */
export const diagnoseValidity = (organisations, year) => {
  const { start } = yearBounds(year)
  const firstJanuary = yearBounds(nextYear(year)).start
  /** @param {string | null | undefined} validFrom */
  const startsBefore = (validFrom) =>
    (dayOf(validFrom)?.localeCompare(start) ?? 0) < 0
  /** @param {string | null | undefined} validTo */
  const endsAfter = (validTo) =>
    (dayOf(validTo)?.localeCompare(firstJanuary) ?? 0) > 0

  const allAccreditations = organisations.flatMap(
    ({ accreditations: all }) => all
  )
  const scannedRegistrations = organisations.flatMap(
    ({ registrations: all }) => all
  ).length

  const registrations = organisations.flatMap((organisation) =>
    organisation.registrations
      .filter(
        ({ validFrom }) => startsBefore(validFrom) || unparseable(validFrom)
      )
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
          startsBefore(validFrom) ||
          endsAfter(validTo) ||
          unparseable(validFrom) ||
          unparseable(validTo)
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
      scannedRegistrations,
      registrationsStartingBefore: registrations.filter(({ validFrom }) =>
        startsBefore(validFrom)
      ).length,
      scannedAccreditations: allAccreditations.length,
      accreditationsStartingBefore: accreditations.filter(({ validFrom }) =>
        startsBefore(validFrom)
      ).length,
      accreditationsEndingAfter: accreditations.filter(({ validTo }) =>
        endsAfter(validTo)
      ).length,
      accreditationsEndingOnFirstJanuary: allAccreditations.filter(
        ({ validTo }) => dayOf(validTo) === firstJanuary
      ).length,
      unparseableDates: [
        ...registrations.map(({ validFrom }) => [validFrom]),
        ...accreditations.map(({ validFrom, validTo }) => [validFrom, validTo])
      ].filter((dates) => dates.some(unparseable)).length,
      rowsInTestOrganisations: [...registrations, ...accreditations].filter(
        (row) => row.testOrganisation
      ).length
    }
  }
}
