import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { previousYear, yearBounds } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import {
  accreditationForYear,
  firstApprovedAt
} from '#organisation-read-model/vocabulary.js'

/** @import { ClassificationContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import { ExporterAccreditation, Organisation as ReadModelOrganisation, Registration as ReadModelRegistration, ReprocessorAccreditation } from '#organisation-read-model/vocabulary.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * @typedef {ReprocessorAccreditation | ExporterAccreditation} ReadModelAccreditation
 */

/**
 * A ledger's accreditation as the organisation read model serves it, with the
 * organisation and registration that hold it.
 *
 * @typedef {Object} LedgerAccreditation
 * @property {ReadModelOrganisation} organisation
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {ReadModelAccreditation} accreditation
 */

/**
 * Every accreditation the read model serves, stored or held outside re-ex, by
 * the `ledgerKey` of the ledger it writes to. Test organisations are left out
 * unless asked for.
 *
 * @param {ReadModelOrganisation[]} organisations
 * @param {{ includeTestOrganisations?: boolean }} [options]
 * @returns {Map<string, LedgerAccreditation>}
 */
export const indexByLedger = (
  organisations,
  { includeTestOrganisations = false } = {}
) =>
  new Map(
    organisations
      .filter(
        ({ organisationNumber }) =>
          includeTestOrganisations ||
          !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
      )
      .flatMap((organisation) =>
        Object.entries(organisation.registrations).flatMap(
          ([number, registration]) => {
            const registrationNumber = toRegistrationNumber(number)
            return Object.values(registration.accreditations).map(
              (accreditation) => [
                ledgerKey({
                  organisationNumber: organisation.organisationNumber,
                  registrationNumber,
                  accreditationNumber: accreditation.accreditationNumber,
                  year: accreditation.year
                }),
                {
                  organisation,
                  registrationNumber,
                  registration,
                  accreditation
                }
              ]
            )
          }
        )
      )
  )

/**
 * The validity window and status timeline that classification reads from the
 * read model's accreditation. ADR-0044 has an accreditation valid from its
 * approval to the end of its scheme year.
 *
 * @param {Pick<ReadModelAccreditation, 'status' | 'year'>} accreditation
 * @returns {AccreditationValidity}
 */
export const validityOf = ({ status: { timeline }, year }) => {
  const { start, end } = yearBounds(year)
  const approvedAt = firstApprovedAt(timeline)
  return {
    timeline,
    ...(approvedAt && {
      validFrom:
        calendarDate(approvedAt).localeCompare(start) < 0
          ? start
          : calendarDate(approvedAt),
      validTo: end
    })
  }
}

/**
 * The approval date of each overseas site an exporter's accreditation lists,
 * by the site's key, as classification reads it.
 *
 * @param {ReadModelAccreditation} accreditation
 * @returns {OverseasSitesContext}
 */
export const overseasSitesOf = (accreditation) =>
  Object.fromEntries(
    Object.entries(
      'overseasSites' in accreditation ? accreditation.overseasSites : {}
    ).map(([key, site]) => [
      key,
      {
        validFrom: site.status === 'approved' ? new Date(site.approvedOn) : null
      }
    ])
  )

/**
 * The registration's accreditation for the year before `year`, or null.
 *
 * @param {Pick<ReadModelRegistration, 'accreditations'>} registration
 * @param {Year} year
 * @returns {ReadModelAccreditation | null}
 */
export const previousYearAccreditationOf = (registration, year) =>
  accreditationForYear(registration, previousYear(year)) ?? null

/**
 * What classifying a ledger's rows again reads of its accreditation as it
 * stands, with the registration's accreditation for the year before.
 *
 * @param {Pick<LedgerAccreditation, 'registration' | 'accreditation'>} ledgerAccreditation
 * @returns {ClassificationContext}
 */
export const ledgerClassificationContextOf = ({
  registration,
  accreditation
}) => {
  const previousYearAccreditation = previousYearAccreditationOf(
    registration,
    accreditation.year
  )
  return {
    ...classificationContextOf({ accreditation }),
    previousYearAccreditation:
      previousYearAccreditation && validityOf(previousYearAccreditation)
  }
}

/**
 * What classifying a row reads of its accreditation, none for a
 * registered-only summary log. Only an accredited exporter's overseas sites
 * are checked.
 *
 * @param {{ accreditation: ReadModelAccreditation | null }} summaryLogAccreditation
 * @returns {ClassificationContext}
 */
export const classificationContextOf = ({ accreditation }) =>
  accreditation === null
    ? { accreditation: null, overseasSites: ORS_VALIDATION_DISABLED }
    : {
        accreditation: validityOf(accreditation),
        overseasSites: overseasSitesOf(accreditation)
      }
