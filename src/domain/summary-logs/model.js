/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import {VALIDATION_CODE} from '#common/enums/validation.js' */
/** @import {SummaryLogFileId, SummaryLogId} from './ids.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} FileUpload
 * @property {SummaryLogFileId} id
 * @property {string} name
 * @property {'pending'|'rejected'} [status] - Absent when the content arrived without an upload
 */

/**
 * @typedef {Object} StoredFile
 * @property {SummaryLogFileId} id
 * @property {string} name
 * @property {'complete'} status
 * @property {string} uri - S3 URI (e.g., s3://bucket/key)
 */

/**
 * @typedef {FileUpload | StoredFile} SummaryLogFile
 */

/**
 * Why the uploader rejected a file.
 *
 * @typedef {typeof VALIDATION_CODE[
 *   | 'FILE_DOWNLOAD_FAILED'
 *   | 'FILE_EMPTY'
 *   | 'FILE_REJECTED'
 *   | 'FILE_TOO_LARGE'
 *   | 'FILE_UPLOAD_FAILED'
 *   | 'FILE_VIRUS_DETECTED'
 *   | 'FILE_WRONG_TYPE'
 * ]} UploadRejectionCode
 */

/**
 * An upload the uploader rejected before the file could be read.
 *
 * @typedef {{ kind: 'file', code: UploadRejectionCode }} UploadRejection
 */

/**
 * @typedef {Object} Validation
 * @property {ValidationIssue[]} [issues] - Validation issues found during processing
 * @property {UploadRejection[]} [failures] - Why the uploader rejected the file
 * @property {ValidationIssueCounts} [counts] - Issue counts by severity (computed pre-cap, so total may exceed issues.length when capped for storage)
 */

/** @import {Loads} from './loads-schema.js' */
/** @import {LoadsByReportingPeriod} from './loads-by-period-status-schema.js' */
/** @import {ValidationIssue, ValidationIssueCounts} from '#common/validation/validation-issues.js' */
/** @import {ProcessingType} from './meta-fields.js' */
/** @import {SummaryLogStatus} from './status.js' */

/**
 * Metadata extracted from the summary log spreadsheet's Cover sheet.
 * All fields are optional because extraction emits only the keys that were
 * present in the parsed file — a missing cell yields a missing field.
 *
 * @typedef {{
 *   PROCESSING_TYPE?: ProcessingType,
 *   TEMPLATE_VERSION?: number,
 *   MATERIAL?: string,
 *   ACCREDITATION_NUMBER?: string,
 *   REGISTRATION_NUMBER?: string
 * }} SummaryLogMeta
 */

/**
 * A summary log uploaded for an accredited registration names its
 * accreditation by number.
 *
 * @typedef {{ accreditationNumber: AccreditationNumber }} UploadedForAnAccreditation
 */

/**
 * A summary log uploaded for a registration with no accreditation.
 *
 * @typedef {{ accreditationNumber: null }} UploadedRegisteredOnly
 */

/**
 * Every shape a summary log's accreditation can take.
 *
 * @typedef {UploadedForAnAccreditation | UploadedRegisteredOnly} SummaryLogAccreditation
 */

/**
 * `commit` is read through `savedCommitOf`, which checks it against today's
 * schema: a summary log may carry one saved before that schema changed.
 *
 * @typedef {{
 *   commit?: unknown,
 *   createdAt?: string,
 *   expiresAt?: Date | null,
 *   file: SummaryLogFile,
 *   loads?: Loads,
 *   loadsByReportingPeriod?: LoadsByReportingPeriod,
 *   meta?: SummaryLogMeta,
 *   year: Year,
 *   organisationNumber?: OrganisationNumber,
 *   registrationNumber?: RegistrationNumber,
 *   status: SummaryLogStatus,
 *   submittedAt?: string,
 *   validatedAgainstSummaryLogId?: SummaryLogId | typeof import('./status.js').NO_PRIOR_SUBMISSION,
 *   validation?: Validation
 * } & SummaryLogAccreditation} SummaryLog
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
