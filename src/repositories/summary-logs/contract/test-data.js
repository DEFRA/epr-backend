import { randomUUID } from 'node:crypto'
import {
  calculateExpiresAt,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import { DEFAULT_TEMPLATE_YEAR } from '#domain/summary-logs/template-year.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { hashClassificationContext } from '#application/summary-logs/classification-context-hash.js'
import { classificationContextOf } from '#waste-balances/application/read-model-accreditations.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { SummaryLogCommit } from '#domain/summary-logs/commit.js' */

export const generateFileId = () => toSummaryLogFileId(`file-${randomUUID()}`)

export const buildFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'complete',
  uri: 's3://test-bucket/test-key',
  ...overrides
})

export const buildPendingFile = (overrides = {}) => {
  const { uri: _u, status: _s, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'pending',
    ...rest
  }
}

export const buildRejectedFile = (overrides = {}) => {
  const { uri: _u, status: _s, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'rejected',
    ...rest
  }
}

/**
 * What validation saves for submission to commit, with nothing to credit, for
 * a registered-only summary log as the factory builds one.
 *
 * @param {Partial<SummaryLogCommit>} [overrides]
 * @returns {SummaryLogCommit}
 */
export const buildSummaryLogCommit = (overrides = {}) => ({
  contextHash: hashClassificationContext(
    classificationContextOf({ accreditation: null })
  ),
  payload: { creditTotal: 0, decemberCreditTotal: 0 },
  counts: { created: 0, updated: 0, decemberWasteRowCount: 0 },
  ...overrides
})

// ============================================================================
// Summary Log Factory
// ============================================================================

const DEFAULT_SUBMITTED_AT = '2024-01-01T00:00:00.000Z'
const DEFAULT_CREATED_AT = '2024-01-01T00:00:00.000Z'

/** @param {string} [id] */
const numberFor = (id) => `number-of-${id ?? randomUUID()}`

/**
 * Gives a summary log the numbers it is stored with, derived from its ids so
 * that summary logs under different ids never share a submitting lock.
 *
 * @template {{ organisationId?: string, registrationId?: string, accreditationId?: string | null }} T
 * @param {T} summaryLog
 */
const withDefaultNumbers = (summaryLog) => ({
  organisationNumber: /** @type {OrganisationNumber} */ (
    numberFor(summaryLog.organisationId)
  ),
  registrationNumber: toRegistrationNumber(
    numberFor(summaryLog.registrationId)
  ),
  accreditationNumber: summaryLog.accreditationId
    ? toAccreditationNumber(numberFor(summaryLog.accreditationId))
    : null,
  ...summaryLog
})

/**
 * Creates a factory function for a given status with default values.
 * The factory merges overrides with defaults, handling nested file objects.
 * @param {string} status
 * @param {() => { file?: { id: string, name: string, status: string, uri?: string }, submittedAt?: string, validatedAgainstSummaryLogId?: string }} [getDefaults] - Function that returns defaults (for lazy file generation)
 */
const createFactory = (status, getDefaults = () => ({})) => {
  return (overrides = {}) => {
    const defaults = getDefaults()
    const { file: fileOverrides, ...rest } = overrides

    // Merge file if both defaults and overrides exist
    const file =
      defaults.file && fileOverrides
        ? { ...defaults.file, ...fileOverrides }
        : (fileOverrides ?? defaults.file)

    return withDefaultNumbers({
      status,
      expiresAt: calculateExpiresAt(status),
      createdAt: DEFAULT_CREATED_AT,
      year: DEFAULT_TEMPLATE_YEAR,
      accreditationId: null,
      ...defaults,
      ...(file && { file }),
      ...rest
    })
  }
}

/**
 * Strips `accreditationId` and its number from a factory-built summary log,
 * so both keys are absent, as on a pre-migration document. Setting them to
 * `undefined` instead would not do this: MongoDB stores an `undefined`
 * object property as BSON `null`, not as an absent field.
 *
 * @template {{accreditationId?: string | null, accreditationNumber?: string | null}} T
 * @param {T} summaryLog
 * @returns {Omit<T, 'accreditationId' | 'accreditationNumber'>}
 */
export const withoutAccreditationId = ({
  accreditationId: _a,
  accreditationNumber: _n,
  ...rest
}) => rest

export const summaryLogFactory = {
  /**
   * PREPROCESSING - file is optional
   * Use when testing upload initiation or CDP status checks
   */
  preprocessing: createFactory(SUMMARY_LOG_STATUS.PREPROCESSING),

  /**
   * VALIDATING - requires file and validatedAgainstSummaryLogId
   * Use when testing validation in progress
   */
  validating: createFactory(SUMMARY_LOG_STATUS.VALIDATING, () => ({
    file: buildFile(),
    validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION
  })),

  /**
   * VALIDATED - requires file
   * Use when testing submission flow or validated state queries
   */
  validated: createFactory(SUMMARY_LOG_STATUS.VALIDATED, () => ({
    file: buildFile()
  })),

  /**
   * INVALID - requires file
   * Use when testing validation failure scenarios
   */
  invalid: createFactory(SUMMARY_LOG_STATUS.INVALID, () => ({
    file: buildFile()
  })),

  /**
   * REJECTED - requires file with rejected status
   * Use when testing file rejection (virus, empty, etc.)
   */
  rejected: createFactory(SUMMARY_LOG_STATUS.REJECTED, () => ({
    file: buildRejectedFile()
  })),

  /**
   * SUBMITTING - requires file and submittedAt
   * Use when testing submission in progress
   */
  submitting: createFactory(SUMMARY_LOG_STATUS.SUBMITTING, () => ({
    file: buildFile(),
    submittedAt: DEFAULT_SUBMITTED_AT
  })),

  /**
   * SUBMITTED - requires file and submittedAt, expiresAt is null
   * Use when testing completed submissions
   */
  submitted: (overrides = {}) => {
    const { file: fileOverrides, ...rest } = overrides
    const file = fileOverrides
      ? { ...buildFile(), ...fileOverrides }
      : buildFile()

    return withDefaultNumbers({
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      expiresAt: null,
      file,
      createdAt: DEFAULT_CREATED_AT,
      submittedAt: DEFAULT_SUBMITTED_AT,
      year: DEFAULT_TEMPLATE_YEAR,
      accreditationId: null,
      ...rest
    })
  },

  /**
   * SUPERSEDED - requires file
   * Use when testing supersession by newer uploads
   */
  superseded: createFactory(SUMMARY_LOG_STATUS.SUPERSEDED, () => ({
    file: buildFile()
  })),

  /**
   * VALIDATION_FAILED - requires file
   * Use when testing worker crashes or timeout scenarios
   */
  validationFailed: createFactory(SUMMARY_LOG_STATUS.VALIDATION_FAILED, () => ({
    file: buildFile()
  })),

  /**
   * SUBMISSION_FAILED - requires file and submittedAt
   * Use when testing submission worker crash scenarios
   */
  submissionFailed: createFactory(SUMMARY_LOG_STATUS.SUBMISSION_FAILED, () => ({
    file: buildFile(),
    submittedAt: DEFAULT_SUBMITTED_AT
  }))
}
