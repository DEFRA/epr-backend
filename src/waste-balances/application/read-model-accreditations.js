import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { ledgerKey } from '#waste-balances/application/accreditation-index.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { toYear, yearBounds } from '#common/helpers/dates/year.js'
import {
  ACCREDITATION_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Organisation as ReadModelOrganisation, Registration as ReadModelRegistration, StatusTimeline } from '#organisation-read-model/domain/model.js' */
/** @import { AccreditationStatus } from '#domain/organisations/model.js' */
/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { OverseasSitesContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * A ledger's accreditation as the organisation read model serves it, with the
 * registration that holds it and the year it is for.
 *
 * @typedef {Object} LedgerAccreditation
 * @property {RegistrationNumber} registrationNumber
 * @property {ReadModelRegistration} registration
 * @property {Year} year
 */

/**
 * Every accreditation the read model serves outside test organisations, stored
 * or held outside re-ex, by the `ledgerKey` of the ledger it writes to.
 *
 * @param {ReadModelOrganisation[]} organisations
 * @returns {Map<string, LedgerAccreditation>}
 */
export const indexByLedger = (organisations) =>
  new Map(
    organisations
      .filter(
        ({ organisationNumber }) =>
          !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
      )
      .flatMap(({ organisationNumber, registrations }) =>
        Object.entries(registrations).flatMap(([number, registration]) => {
          const registrationNumber = toRegistrationNumber(number)
          return Object.entries(registration.accreditations).map(
            ([year, { accreditationNumber }]) => [
              ledgerKey({
                organisationNumber,
                registrationNumber,
                accreditationNumber
              }),
              { registrationNumber, registration, year: toYear(Number(year)) }
            ]
          )
        })
      )
  )

/** @type {ReadonlySet<string>} */
const ACCREDITATION_STATUS_VALUES = new Set(Object.values(ACCREDITATION_STATUS))

/**
 * @param {StatusTimeline[number]} change
 * @returns {change is { status: AccreditationStatus, at: string }}
 */
const isAccreditationChange = (change) =>
  ACCREDITATION_STATUS_VALUES.has(change.status)

/**
 * The validity window and status history that classification reads, taken
 * from the read model's accreditation for its year. ADR-0044 has an
 * accreditation valid from its approval to the end of its scheme year.
 *
 * @param {LedgerAccreditation} ledgerAccreditation
 * @returns {AccreditationValidity}
 */
export const validityOf = ({ registration, year }) => {
  const { start, end } = yearBounds(year)
  const timeline = registration.accreditations[year].status.timeline.filter(
    isAccreditationChange
  )
  const lastCreated = timeline.findLastIndex(
    ({ status }) => status === ACCREDITATION_STATUS.CREATED
  )
  const approvedAt = timeline.find(
    ({ status }, index) =>
      index > lastCreated && status === ACCREDITATION_STATUS.APPROVED
  )?.at
  return {
    statusHistory: timeline.map(({ status, at }) => ({
      status,
      updatedAt: at
    })),
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
 * @param {LedgerAccreditation} ledgerAccreditation
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
