import { randomUUID } from 'node:crypto'
import {
  calculateExpiresAt,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'

export const generateFileId = () => `file-${randomUUID()}`

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

// ============================================================================
// Summary Log Factory
// ============================================================================

const DEFAULT_SUBMITTED_AT = '2024-01-01T00:00:00.000Z'

/**
 * Creates a factory function for a given status with default values.
 * The factory merges overrides with defaults, handling nested file objects.
 * @param {string} status
 * @param {() => object} [getDefaults] - Function that returns defaults (for lazy file generation)
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

    return {
      status,
      expiresAt: calculateExpiresAt(status),
      ...defaults,
      ...(file && { file }),
      ...rest
    }
  }
}

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

    return {
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      expiresAt: null,
      file,
      submittedAt: DEFAULT_SUBMITTED_AT,
      ...rest
    }
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
  }))
}

// ============================================================================
// Backward Compatibility (deprecated)
// ============================================================================

/** @type {Set<string>} */
const STATUSES_REQUIRING_SUBMITTED_AT = new Set([
  SUMMARY_LOG_STATUS.SUBMITTING,
  SUMMARY_LOG_STATUS.SUBMITTED
])
/** @type {Set<string>} */
const STATUSES_REQUIRING_BASELINE = new Set([SUMMARY_LOG_STATUS.VALIDATING])

/**
 * @typedef {Object} SummaryLogOverrides
 * @property {string} [status]
 * @property {Object} [file]
 * @property {string} [submittedAt]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {string} [validatedAgainstSummaryLogId]
 * @property {Date|null} [expiresAt]
 */

/**
 * @param {SummaryLogOverrides} [overrides]
 */
export const buildSummaryLog = (overrides = {}) => {
  const {
    file,
    submittedAt,
    validatedAgainstSummaryLogId,
    expiresAt,
    ...logOverrides
  } = overrides
  const status = logOverrides.status ?? SUMMARY_LOG_STATUS.VALIDATING

  /** @type {Record<string, unknown>} */
  const base = {
    status,
    file: file === undefined ? buildFile() : file,
    expiresAt: expiresAt === undefined ? calculateExpiresAt(status) : expiresAt,
    ...logOverrides
  }

  // Auto-generate submittedAt for submitting/submitted statuses if not provided
  if (STATUSES_REQUIRING_SUBMITTED_AT.has(status)) {
    base.submittedAt = submittedAt ?? new Date().toISOString()
  }

  // Auto-generate validatedAgainstSummaryLogId for validating status if not provided
  // (Schema forbids this field for non-validating statuses)
  if (STATUSES_REQUIRING_BASELINE.has(status)) {
    base.validatedAgainstSummaryLogId =
      validatedAgainstSummaryLogId ?? NO_PRIOR_SUBMISSION
  }

  return base
}
