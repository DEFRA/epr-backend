import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'

/** @import { Organisation, RegOrAccStatus } from '#domain/organisations/model.js' */

/**
 * The formats epr-frontend recognises in a page URL (PAE-2041).
 */
const REGISTRATION_NUMBER = /^R\d{2}[A-Z0-9]+$/
const ACCREDITATION_NUMBER = /^A\d{2}[A-Z0-9]+$/

const OUTSIDE_A_URL_SEGMENT = /[/\s]/

/**
 * The records the organisation read model serves, so a page addresses.
 * @type {ReadonlySet<RegOrAccStatus>}
 */
const ADDRESSED_REGISTRATION_STATUSES = new Set([
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.CANCELLED
])
/** @type {ReadonlySet<RegOrAccStatus>} */
const ADDRESSED_ACCREDITATION_STATUSES = new Set([
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED,
  ACCREDITATION_STATUS.CANCELLED
])

/**
 * @typedef {Object} FormatMismatchRow
 * @property {'accreditation' | 'registration'} recordType
 * @property {string | null} number - as stored
 * @property {boolean} breaksUrlSegment - holds a slash or whitespace
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} recordId
 * @property {RegOrAccStatus} status
 */

/**
 * @typedef {Object} NaturalKeyFormatsSummary
 * @property {number} scannedOrganisations
 * @property {number} checkedRegistrations
 * @property {number} checkedAccreditations
 * @property {number} mismatchedRegistrationNumbers
 * @property {number} mismatchedAccreditationNumbers
 */

/**
 * @typedef {Object} NumberedRecord
 * @property {string} id
 * @property {RegOrAccStatus} status
 * @property {string | null | undefined} number
 */

/**
 * @param {Organisation[]} organisations
 * @param {FormatMismatchRow['recordType']} recordType
 * @param {(organisation: Organisation) => NumberedRecord[]} addressedRecordsOf
 * @param {RegExp} format
 * @returns {{ checked: number, rows: FormatMismatchRow[] }}
 */
const findMismatches = (
  organisations,
  recordType,
  addressedRecordsOf,
  format
) => {
  let checked = 0

  const rows = organisations.flatMap((organisation) =>
    addressedRecordsOf(organisation).flatMap(({ id, status, number }) => {
      checked++
      const stored = number ?? null

      if (stored !== null && format.test(stored)) {
        return []
      }

      return [
        {
          recordType,
          number: stored,
          breaksUrlSegment:
            stored !== null && OUTSIDE_A_URL_SEGMENT.test(stored),
          organisationId: organisation.id,
          orgId: organisation.orgId,
          testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
          recordId: id,
          status
        }
      ]
    })
  )

  return { checked, rows }
}

/**
 * Lists every registration and accreditation a page addresses by number whose
 * number is not in the format epr-frontend recognises in a URL.
 *
 * @param {Organisation[]} organisations
 * @returns {{ rows: FormatMismatchRow[], summary: NaturalKeyFormatsSummary }}
 */
export const diagnoseNaturalKeyFormats = (organisations) => {
  const registrations = findMismatches(
    organisations,
    'registration',
    (organisation) =>
      organisation.registrations
        .filter(({ status }) => ADDRESSED_REGISTRATION_STATUSES.has(status))
        .map(({ id, status, registrationNumber }) => ({
          id,
          status,
          number: registrationNumber
        })),
    REGISTRATION_NUMBER
  )
  const accreditations = findMismatches(
    organisations,
    'accreditation',
    (organisation) =>
      organisation.accreditations
        .filter(({ status }) => ADDRESSED_ACCREDITATION_STATUSES.has(status))
        .map(({ id, status, accreditationNumber }) => ({
          id,
          status,
          number: accreditationNumber
        })),
    ACCREDITATION_NUMBER
  )

  return {
    rows: [...registrations.rows, ...accreditations.rows],
    summary: {
      scannedOrganisations: organisations.length,
      checkedRegistrations: registrations.checked,
      checkedAccreditations: accreditations.checked,
      mismatchedRegistrationNumbers: registrations.rows.length,
      mismatchedAccreditationNumbers: accreditations.rows.length
    }
  }
}
