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
