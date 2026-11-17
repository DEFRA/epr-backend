/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#organisations/index.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * The numbers a summary log stores beside the ids it holds. The accreditation
 * number is `null` for a registered-only summary log.
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
 * @property {Year} [year] - Absent matches every year
 */

/**
 * Whether a summary log holds its organisation and registration numbers.
 *
 * @param {SummaryLog} summaryLog
 * @returns {summaryLog is SummaryLog & {
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber
 * }}
 */
export const holdsNumbers = (summaryLog) =>
  summaryLog.organisationNumber !== undefined &&
  summaryLog.registrationNumber !== undefined

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
    accreditationNumber,
    ...(year !== undefined && { year })
  }
}
