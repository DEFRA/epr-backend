/**
 * @typedef {{
 *   organisationNumber: number,
 *   registrationNumber: string,
 *   year: number,
 *   accredited: boolean,
 *   summaryLogId: string
 * }} UploadCompletedPathArgs
 */

/**
 * The natural-key path CDP Uploader calls back on, under the address the
 * upload was started at, so the callback knows its year and whether it is
 * accredited.
 *
 * @param {UploadCompletedPathArgs} args
 * @returns {string}
 */
export const uploadCompletedPath = ({
  organisationNumber,
  registrationNumber,
  year,
  accredited,
  summaryLogId
}) => {
  const registration = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const uploads = accredited
    ? `${registration}/accreditations/${year}/summary-log`
    : `${registration}/summary-logs/${year}`
  return `${uploads}/${summaryLogId}/upload-completed`
}
