import { utcYearOf } from '#common/helpers/dates/year.js'
import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation, StoredAccreditationStatus, StoredRegistrationStatus } from '#domain/organisations/model.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/** @typedef {'before' | 'after' | 'empty' | 'unparseable'} DateProblem */

/** @typedef {Record<DateProblem, number>} DateProblemCounts */

/**
 * @typedef {Object} RegistrationOutsideYearRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} registrationId
 * @property {RegistrationNumber | null} registrationNumber
 * @property {StoredRegistrationStatus} status
 * @property {string | null | undefined} validFrom
 * @property {DateProblem} validFromProblem
 */

/**
 * @typedef {Object} AccreditationOutsideYearRow
 * @property {OrganisationNumber} organisationNumber
 * @property {boolean} testOrganisation
 * @property {string} accreditationId
 * @property {AccreditationNumber | null} accreditationNumber
 * @property {StoredAccreditationStatus} status
 * @property {string | null | undefined} validFrom
 * @property {DateProblem | undefined} validFromProblem
 * @property {string | null | undefined} validTo
 * @property {DateProblem | undefined} validToProblem
 */

/**
 * @typedef {Object} ValidityOutsideYearSummary
 * @property {Year} year
 * @property {number} scannedRegistrations
 * @property {number} registrationsOutsideYear
 * @property {DateProblemCounts} registrationValidFrom
 * @property {number} scannedAccreditations
 * @property {number} accreditationsOutsideYear
 * @property {DateProblemCounts} accreditationValidFrom
 * @property {DateProblemCounts} accreditationValidTo
 * @property {number} rowsInTestOrganisations
 */

/**
 * @typedef {Object} ValidityOutsideYearReport
 * @property {RegistrationOutsideYearRow[]} registrations
 * @property {AccreditationOutsideYearRow[]} accreditations
 * @property {ValidityOutsideYearSummary} summary
 */

/**
 * Stored documents can hold `null` where the type has no date.
 *
 * @param {string | null | undefined} date
 * @param {Year} year
 * @returns {DateProblem | undefined}
 */
const problemWith = (date, year) => {
  if (!date) {
    return 'empty'
  }
  if (Number.isNaN(new Date(date).getTime())) {
    return 'unparseable'
  }
  const dateYear = utcYearOf(date)
  if (dateYear < year) {
    return 'before'
  }
  return dateYear > year ? 'after' : undefined
}

/**
 * @param {(DateProblem | undefined)[]} problems
 * @returns {DateProblemCounts}
 */
const countProblems = (problems) => ({
  before: problems.filter((problem) => problem === 'before').length,
  after: problems.filter((problem) => problem === 'after').length,
  empty: problems.filter((problem) => problem === 'empty').length,
  unparseable: problems.filter((problem) => problem === 'unparseable').length
})

/**
 * Lists every stored registration whose `validFrom`, and every stored
 * accreditation whose `validFrom` or `validTo`, is empty, does not parse, or
 * falls outside `year`, whatever its number or status.
 *
 * @param {Organisation[]} organisations
 * @param {Year} year
 * @returns {ValidityOutsideYearReport}
 */
export const diagnoseValidityOutsideYear = (organisations, year) => {
  const registrations = organisations.flatMap((organisation) =>
    organisation.registrations.flatMap((registration) => {
      const validFromProblem = problemWith(registration.validFrom, year)
      return validFromProblem
        ? [
            {
              organisationNumber: organisation.organisationNumber,
              testOrganisation: isTestOrganisation(organisation),
              registrationId: registration.id,
              registrationNumber: registration.registrationNumber,
              status: registration.status,
              validFrom: registration.validFrom,
              validFromProblem
            }
          ]
        : []
    })
  )

  const accreditations = organisations.flatMap((organisation) =>
    organisation.accreditations.flatMap((accreditation) => {
      const validFromProblem = problemWith(accreditation.validFrom, year)
      const validToProblem = problemWith(accreditation.validTo, year)
      return validFromProblem || validToProblem
        ? [
            {
              organisationNumber: organisation.organisationNumber,
              testOrganisation: isTestOrganisation(organisation),
              accreditationId: accreditation.id,
              accreditationNumber: accreditation.accreditationNumber,
              status: accreditation.status,
              validFrom: accreditation.validFrom,
              validFromProblem,
              validTo: accreditation.validTo,
              validToProblem
            }
          ]
        : []
    })
  )

  return {
    registrations,
    accreditations,
    summary: {
      year,
      scannedRegistrations: organisations.reduce(
        (count, { registrations: all }) => count + all.length,
        0
      ),
      registrationsOutsideYear: registrations.length,
      registrationValidFrom: countProblems(
        registrations.map(({ validFromProblem }) => validFromProblem)
      ),
      scannedAccreditations: organisations.reduce(
        (count, { accreditations: all }) => count + all.length,
        0
      ),
      accreditationsOutsideYear: accreditations.length,
      accreditationValidFrom: countProblems(
        accreditations.map(({ validFromProblem }) => validFromProblem)
      ),
      accreditationValidTo: countProblems(
        accreditations.map(({ validToProblem }) => validToProblem)
      ),
      rowsInTestOrganisations: [...registrations, ...accreditations].filter(
        (row) => row.testOrganisation
      ).length
    }
  }
}
