import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { toYear, yearBounds } from '#common/helpers/dates/year.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { firstApprovedAt } from '#organisation-read-model/domain/status-timeline.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { ClassificationContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @import { AccreditationCommon as ReadModelAccreditation, Organisation as ReadModelOrganisation, Registration as ReadModelRegistration } from '#organisation-read-model/domain/model.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * A ledger's accreditation as the organisation read model serves it, with the
 * organisation and registration that hold it and the year it is for.
 *
 * @typedef {Object} LedgerAccreditation
 * @property {ReadModelOrganisation} organisation
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {Year} year
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
            return Object.entries(registration.accreditations).map(
              ([key, accreditation]) => {
                const year = toYear(Number(key))
                return [
                  ledgerKey({
                    organisationNumber: organisation.organisationNumber,
                    registrationNumber,
                    accreditationNumber: accreditation.accreditationNumber,
                    year
                  }),
                  {
                    organisation,
                    registrationNumber,
                    registration,
                    year,
                    accreditation
                  }
                ]
              }
            )
          }
        )
      )
  )

/**
 * The validity window and status timeline that classification reads, taken
 * from the read model's accreditation for its year. ADR-0044 has an
 * accreditation valid from its approval to the end of its scheme year.
 *
 * @param {Pick<LedgerAccreditation, 'registration' | 'year'>} ledgerAccreditation
 * @returns {AccreditationValidity}
 */
export const validityOf = ({ registration, year }) => {
  const { start, end } = yearBounds(year)
  const { timeline } = registration.accreditations[year].status
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
 * @param {Pick<LedgerAccreditation, 'registration' | 'year'>} ledgerAccreditation
 * @returns {OverseasSitesContext}
 */
export const overseasSitesOf = ({ registration, year }) =>
  Object.fromEntries(
    Object.entries(
      registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
        ? registration.accreditations[year].overseasSites
        : {}
    ).map(([key, site]) => [
      key,
      {
        validFrom: site.status === 'approved' ? new Date(site.approvedOn) : null
      }
    ])
  )

/**
 * What classifying a row reads of its accreditation, none for a
 * registered-only summary log. Only an accredited exporter's overseas sites
 * are checked.
 *
 * @param {{ registration: ReadModelRegistration, year: Year | null }} accreditationYear
 * @returns {ClassificationContext}
 */
export const classificationContextOf = ({ registration, year }) =>
  year === null
    ? { accreditation: null, overseasSites: ORS_VALIDATION_DISABLED }
    : {
        accreditation: validityOf({ registration, year }),
        overseasSites: overseasSitesOf({ registration, year })
      }
