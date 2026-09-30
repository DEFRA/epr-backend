import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  calculateExpiresAt,
  createRejectedValidation,
  determineStatusFromUpload,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  transitionStatus,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { SummaryLog } from '#domain/summary-logs/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */
/** @import { SummaryLogUpload } from './post.schema.js' */

export const buildFileData = (upload, existingFile) => {
  const { fileId, filename, fileStatus, s3Bucket, s3Key } = upload

  const fileData = existingFile
    ? { ...existingFile, id: fileId, name: filename, status: fileStatus }
    : { id: fileId, name: filename, status: fileStatus }

  if (fileStatus === UPLOAD_STATUS.COMPLETE) {
    fileData.uri = `s3://${s3Bucket}/${s3Key}`
  }

  return fileData
}

const buildSummaryLogData = (
  upload,
  existingFile,
  organisationId,
  registrationId,
  year,
  accreditationId
) => {
  const status = determineStatusFromUpload(upload.fileStatus)
  const yearFields = year === undefined ? {} : { year, accreditationId }

  /** @type {SummaryLog} */
  const data = {
    status,
    expiresAt: calculateExpiresAt(status),
    createdAt: new Date().toISOString(),
    file: buildFileData(upload, existingFile),
    organisationId,
    registrationId,
    ...yearFields
  }

  if (status === SUMMARY_LOG_STATUS.REJECTED) {
    data.validation = createRejectedValidation(upload.errorMessage)
  }

  return data
}

/**
 * A year-scoped upload's accreditation is the registration's currently
 * approved (or suspended) accreditation — not asked for on the upload itself,
 * since a summary log's template must already match it or meta-business
 * validation rejects the file. A cancelled or rejected accreditation still
 * linked to the registration doesn't count: the upload is treated as
 * registered-only. A legacy (unscoped) upload resolves the same way it always
 * has, once `validate.js` runs.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {Promise<string | null>}
 */
const resolveAccreditationId = async (
  organisationsRepository,
  organisationId,
  registrationId
) => {
  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  if (!isRegistrationAccredited(registration)) {
    return null
  }

  return /** @type {{ accreditation: { id: string } }} */ (registration)
    .accreditation.id
}

/**
 * @param {SummaryLogsRepository} summaryLogsRepository
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} summaryLogId
 * @param {SummaryLogUpload} upload
 * @param {TypedLogger} logger
 * @param {{ organisationId: string, registrationId: string, year: number | undefined }} location
 * @returns {Promise<string>} The new status
 */
export const updateStatusBasedOnUpload = async (
  summaryLogsRepository,
  organisationsRepository,
  summaryLogId,
  upload,
  logger,
  { organisationId, registrationId, year }
) => {
  const existing = await summaryLogsRepository.findById(summaryLogId)
  const newStatus = determineStatusFromUpload(upload.fileStatus)

  if (existing) {
    const { version, summaryLog } = existing
    try {
      transitionStatus(summaryLog, newStatus)
    } catch (error) {
      logger.error({
        message: error.message,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE,
          reference: summaryLogId
        },
        http: {
          response: {
            status_code: StatusCodes.CONFLICT
          }
        }
      })

      throw Boom.conflict(error.message)
    }

    const updates = buildSummaryLogData(
      upload,
      summaryLog.file,
      organisationId,
      registrationId,
      undefined,
      undefined
    )
    await summaryLogsRepository.update(summaryLogId, version, updates)
  } else {
    const accreditationId =
      year === undefined
        ? undefined
        : await resolveAccreditationId(
            organisationsRepository,
            organisationId,
            registrationId
          )

    const summaryLog = buildSummaryLogData(
      upload,
      undefined,
      organisationId,
      registrationId,
      year,
      accreditationId
    )

    if (newStatus === SUMMARY_LOG_STATUS.VALIDATING) {
      const latestSubmitted =
        await summaryLogsRepository.findLatestSubmittedForOrgReg({
          organisationId,
          registrationId,
          year,
          accreditationId
        })
      summaryLog.validatedAgainstSummaryLogId =
        latestSubmitted?.id ?? NO_PRIOR_SUBMISSION
    }

    await summaryLogsRepository.insert(summaryLogId, summaryLog)
  }

  return newStatus
}

export const formatS3Info = (upload) =>
  upload.fileStatus === UPLOAD_STATUS.COMPLETE &&
  upload.s3Bucket &&
  upload.s3Key
    ? `, s3Bucket=${upload.s3Bucket}, s3Key=${upload.s3Key}`
    : ''
