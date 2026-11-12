/** @import {Brand} from '#common/helpers/brand.js' */

/**
 * Where CDP Uploader stores an upload's files, under its bucket.
 *
 * @typedef {Brand<string, 'UploadPath'>} UploadPath
 *
 * @typedef {{ bucket: string, path: UploadPath }} UploadLocation
 *
 * A file as CDP Uploader reports it: only a completed file names where it is.
 *
 * @typedef {{ fileStatus: string, s3Bucket?: string, s3Key?: string }} UploadedFile
 */

/** The status CDP Uploader gives each uploaded file. */
export const UPLOAD_FILE_STATUS = Object.freeze({
  COMPLETE: 'complete',
  REJECTED: 'rejected',
  PENDING: 'pending'
})

/**
 * @param {string} value
 * @returns {UploadPath}
 */
export const toUploadPath = (value) => /** @type {UploadPath} */ (value)

/**
 * @param {{ organisationId: string, registrationId: string }} ids
 * @returns {UploadPath}
 */
export const summaryLogUploadPath = ({ organisationId, registrationId }) =>
  toUploadPath(
    `/organisations/${organisationId}/registrations/${registrationId}`
  )

/**
 * @param {string} importId
 * @returns {UploadPath}
 */
export const orsImportUploadPath = (importId) =>
  toUploadPath(`/overseas-sites/imports/${importId}`)

/**
 * A completed file must be in the location's bucket and under its path; any
 * other file names no location to check.
 *
 * @param {UploadedFile} file
 * @param {UploadLocation} location
 * @returns {boolean}
 */
export const isInUploadLocation = (
  { fileStatus, s3Bucket, s3Key },
  { bucket, path }
) =>
  fileStatus !== UPLOAD_FILE_STATUS.COMPLETE ||
  (s3Bucket === bucket && Boolean(s3Key?.startsWith(`${path}/`)))

/**
 * Where a completed file is, for a log message; any other file names nowhere.
 *
 * @param {UploadedFile} file
 * @returns {string}
 */
export const formatS3Info = ({ fileStatus, s3Bucket, s3Key }) =>
  fileStatus === UPLOAD_FILE_STATUS.COMPLETE && s3Bucket && s3Key
    ? `, s3Bucket=${s3Bucket}, s3Key=${s3Key}`
    : ''
