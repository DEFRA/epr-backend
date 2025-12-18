import { randomUUID } from 'node:crypto'

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

const STATUSES_REQUIRING_SUBMITTED_AT = new Set(['submitting', 'submitted'])

/**
 * @typedef {Object} SummaryLogOverrides
 * @property {string} [status]
 * @property {Object} [file]
 * @property {string} [submittedAt]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {string} [validatedAgainstSummaryLogId]
 */

/**
 * @param {SummaryLogOverrides} [overrides]
 */
export const buildSummaryLog = (overrides = {}) => {
  const { file, submittedAt, ...logOverrides } = overrides
  const status = logOverrides.status ?? 'validating'

  /** @type {Record<string, unknown>} */
  const base = {
    status,
    file: file === undefined ? buildFile() : file,
    ...logOverrides
  }

  // Auto-generate submittedAt for submitting/submitted statuses if not provided
  if (STATUSES_REQUIRING_SUBMITTED_AT.has(status)) {
    base.submittedAt = submittedAt ?? new Date().toISOString()
  }

  return base
}
