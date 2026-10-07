/**
 * @typedef {{
 *   organisationNumber: number,
 *   registrationNumber: string,
 *   year: number,
 *   accredited: boolean,
 *   summaryLogId: string,
 *   suffix?: string
 * }} SummaryLogPathArgs
 */

/**
 * The natural-key path of one summary log, under the address of the kind it
 * was posted to.
 *
 * @param {SummaryLogPathArgs} args
 * @returns {string}
 */
export const summaryLogPath = ({
  organisationNumber,
  registrationNumber,
  year,
  accredited,
  summaryLogId,
  suffix = ''
}) => {
  const registration = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const summaryLogs = accredited
    ? `${registration}/accreditations/${year}/summary-log`
    : `${registration}/summary-logs/${year}`
  return `${summaryLogs}/${summaryLogId}${suffix}`
}
