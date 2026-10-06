import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'

/** @import { Organisation, RegOrAccStatus } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} NumberHolder
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} recordId
 * @property {RegOrAccStatus} status
 */

/**
 * @typedef {Object} DuplicateNumberRow
 * @property {'accreditation' | 'registration'} recordType
 * @property {string} number
 * @property {number} organisations - 1 when every holder is in the same organisation
 * @property {NumberHolder[]} holders
 */

/**
 * @typedef {Object} DuplicateNumbersSummary
 * @property {number} scannedOrganisations
 * @property {number} numberedAccreditations
 * @property {number} numberedRegistrations
 * @property {number} duplicateAccreditationNumbers
 * @property {number} duplicateRegistrationNumbers
 */

/**
 * @typedef {Object} DuplicateNumbersReport
 * @property {DuplicateNumberRow[]} rows
 * @property {DuplicateNumbersSummary} summary
 */

/**
 * @typedef {Object} NumberedRecord
 * @property {string} id
 * @property {RegOrAccStatus} status
 * @property {string | null | undefined} number
 */

/**
 * @param {Organisation[]} organisations
 * @param {DuplicateNumberRow['recordType']} recordType
 * @param {(organisation: Organisation) => NumberedRecord[]} numberedRecordsOf
 * @returns {{ numbered: number, rows: DuplicateNumberRow[] }}
 */
const findDuplicates = (organisations, recordType, numberedRecordsOf) => {
  const holders = organisations.flatMap((organisation) =>
    numberedRecordsOf(organisation).flatMap(({ id, status, number }) =>
      typeof number === 'string'
        ? [
            {
              number,
              holder: {
                organisationId: organisation.id,
                orgId: organisation.orgId,
                testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
                recordId: id,
                status
              }
            }
          ]
        : []
    )
  )

  const rows = [...Map.groupBy(holders, ({ number }) => number)]
    .map(([number, entries]) => ({
      recordType,
      number,
      organisations: new Set(entries.map(({ holder }) => holder.organisationId))
        .size,
      holders: entries.map(({ holder }) => holder)
    }))
    .filter(({ holders }) => holders.length > 1)

  return { numbered: holders.length, rows }
}

/**
 * Lists every accreditation number and every registration number held by more
 * than one record, whether the records are in different organisations or the
 * same one. Records without a number are ignored.
 *
 * @param {Organisation[]} organisations
 * @returns {DuplicateNumbersReport}
 */
export const diagnoseDuplicateNumbers = (organisations) => {
  const accreditations = findDuplicates(
    organisations,
    'accreditation',
    (organisation) =>
      organisation.accreditations.map(
        ({ id, status, accreditationNumber }) => ({
          id,
          status,
          number: accreditationNumber
        })
      )
  )
  const registrations = findDuplicates(
    organisations,
    'registration',
    (organisation) =>
      organisation.registrations.map(({ id, status, registrationNumber }) => ({
        id,
        status,
        number: registrationNumber
      }))
  )

  return {
    rows: [...accreditations.rows, ...registrations.rows],
    summary: {
      scannedOrganisations: organisations.length,
      numberedAccreditations: accreditations.numbered,
      numberedRegistrations: registrations.numbered,
      duplicateAccreditationNumbers: accreditations.rows.length,
      duplicateRegistrationNumbers: registrations.rows.length
    }
  }
}
