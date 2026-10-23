/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * The numbers a summary log stores beside the ids it holds. The accreditation
 * number is `null` for a registered-only summary log, and absent when the
 * summary log holds no accreditation id.
 *
 * @typedef {Pick<SummaryLog, 'organisationNumber' | 'registrationNumber' | 'accreditationNumber'>} SummaryLogNumbers
 */

/**
 * Names a registration's summary logs by the numbers the domain issues, in
 * place of their database ids.
 *
 * @typedef {Object} SummaryLogKey
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {AccreditationNumber|null} [accreditationNumber] - `null` for registered-only;
 *   absent matches every accreditation
 * @property {number} [year] - Absent matches every year
 */

/**
 * Whether a summary log holds a number beside each of the ids it holds.
 *
 * @param {SummaryLog} summaryLog
 * @returns {summaryLog is SummaryLog & {
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber
 * }}
 */
export const holdsNumbers = (summaryLog) =>
  summaryLog.organisationNumber !== undefined &&
  summaryLog.registrationNumber !== undefined &&
  (summaryLog.accreditationId === undefined ||
    summaryLog.accreditationNumber !== undefined)

/**
 * The key naming the summary logs that share this one's registration, year
 * and accreditation.
 *
 * @param {SummaryLog} summaryLog
 * @returns {SummaryLogKey}
 */
export const summaryLogKeyOf = (summaryLog) => {
  if (!holdsNumbers(summaryLog)) {
    throw new TypeError('The summary log is missing one of its numbers')
  }
  const { organisationNumber, registrationNumber, accreditationNumber, year } =
    summaryLog
  return {
    organisationNumber,
    registrationNumber,
    ...(accreditationNumber !== undefined && { accreditationNumber }),
    ...(year !== undefined && { year })
  }
}
