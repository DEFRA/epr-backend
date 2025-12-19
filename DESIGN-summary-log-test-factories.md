# Design: Summary Log Test Factories

## Problem

When adding the `expiresAt` field to summary logs (PAE-755), 33 files required changes because tests were creating summary log objects in multiple ways:

1. Inline objects with manual `expiresAt: calculateExpiresAt(status)`
2. Local helper functions duplicating the same logic
3. Inconsistent use of the existing `buildSummaryLog` helper

This means any future schema change (adding a new required field, changing validation rules) will require similarly widespread changes.

## Solution

Replace the generic `buildSummaryLog` with **status-based factory functions** that automatically handle all required plumbing for each status. Tests only specify what's relevant to the test itself.

### API Design

```javascript
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'

// Minimal - just need a preprocessing log
const log = summaryLogFactory.preprocessing()

// With org/reg context
const log = summaryLogFactory.validated({ organisationId, registrationId })

// With specific file configuration
const log = summaryLogFactory.rejected({
  file: { name: 'virus.xlsx' }
})

// With validation issues
const log = summaryLogFactory.invalid({
  validation: { issues: [{ code: 'DUPLICATE_LOAD', row: 5 }] }
})
```

### Status Requirements

| Status            | File                | submittedAt | validatedAgainstSummaryLogId | expiresAt |
| ----------------- | ------------------- | ----------- | ---------------------------- | --------- |
| PREPROCESSING     | Optional            | Forbidden   | Forbidden                    | Auto      |
| VALIDATING        | Required (complete) | Forbidden   | Required                     | Auto      |
| VALIDATED         | Required (complete) | Forbidden   | Forbidden                    | Auto      |
| INVALID           | Required (complete) | Forbidden   | Forbidden                    | Auto      |
| REJECTED          | Required (rejected) | Forbidden   | Forbidden                    | Auto      |
| SUBMITTING        | Required (complete) | Required    | Forbidden                    | Auto      |
| SUBMITTED         | Required (complete) | Required    | Forbidden                    | null      |
| SUPERSEDED        | Required (complete) | Forbidden   | Forbidden                    | Auto      |
| VALIDATION_FAILED | Required (complete) | Forbidden   | Forbidden                    | Auto      |

### Implementation

Location: `src/repositories/summary-logs/contract/test-data.js`

```javascript
import { randomUUID } from 'node:crypto'
import {
  calculateExpiresAt,
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'

// ============================================================================
// File Builders
// ============================================================================

export const generateFileId = () => `file-${randomUUID()}`

const defaultFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'complete',
  uri: 's3://test-bucket/test-key',
  ...overrides
})

const defaultPendingFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'pending',
  ...overrides
})

const defaultRejectedFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'rejected',
  ...overrides
})

// ============================================================================
// Factory Builder
// ============================================================================

const DEFAULT_SUBMITTED_AT = '2024-01-01T00:00:00.000Z'

/**
 * Creates a factory function for a given status with default values.
 * The factory merges overrides with defaults, handling nested file objects.
 */
const createFactory = (status, defaults = {}) => {
  return (overrides = {}) => {
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

// ============================================================================
// Summary Log Factories
// ============================================================================

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
  validating: createFactory(SUMMARY_LOG_STATUS.VALIDATING, {
    file: defaultFile(),
    validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION
  }),

  /**
   * VALIDATED - requires file
   * Use when testing submission flow or validated state queries
   */
  validated: createFactory(SUMMARY_LOG_STATUS.VALIDATED, {
    file: defaultFile()
  }),

  /**
   * INVALID - requires file
   * Use when testing validation failure scenarios
   */
  invalid: createFactory(SUMMARY_LOG_STATUS.INVALID, {
    file: defaultFile()
  }),

  /**
   * REJECTED - requires file with rejected status
   * Use when testing file rejection (virus, empty, etc.)
   */
  rejected: createFactory(SUMMARY_LOG_STATUS.REJECTED, {
    file: defaultRejectedFile()
  }),

  /**
   * SUBMITTING - requires file and submittedAt
   * Use when testing submission in progress
   */
  submitting: createFactory(SUMMARY_LOG_STATUS.SUBMITTING, {
    file: defaultFile(),
    submittedAt: DEFAULT_SUBMITTED_AT
  }),

  /**
   * SUBMITTED - requires file and submittedAt, expiresAt is null
   * Use when testing completed submissions
   */
  submitted: (overrides = {}) => {
    const { file: fileOverrides, ...rest } = overrides
    const file = fileOverrides
      ? { ...defaultFile(), ...fileOverrides }
      : defaultFile()

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
  superseded: createFactory(SUMMARY_LOG_STATUS.SUPERSEDED, {
    file: defaultFile()
  }),

  /**
   * VALIDATION_FAILED - requires file
   * Use when testing worker crashes or timeout scenarios
   */
  validationFailed: createFactory(SUMMARY_LOG_STATUS.VALIDATION_FAILED, {
    file: defaultFile()
  })
}

// ============================================================================
// Backward Compatibility (deprecated)
// ============================================================================

// Keep existing buildSummaryLog for gradual migration
// New tests should use summaryLogFactory instead
export const buildSummaryLog = summaryLogFactory.validating
export const buildFile = defaultFile
export const buildPendingFile = defaultPendingFile
export const buildRejectedFile = defaultRejectedFile
```

### Migration Strategy

1. Add `summaryLogFactory` to `test-data.js` alongside existing helpers
2. Keep `buildSummaryLog`, `buildFile`, etc. for backward compatibility
3. Update tests incrementally - no big bang migration required
4. New tests should use `summaryLogFactory`

### Example Transformations

**Before:**

```javascript
await summaryLogsRepository.insert(summaryLogId, {
  status: SUMMARY_LOG_STATUS.PREPROCESSING,
  expiresAt: calculateExpiresAt(SUMMARY_LOG_STATUS.PREPROCESSING),
  organisationId,
  registrationId
})
```

**After:**

```javascript
await summaryLogsRepository.insert(
  summaryLogId,
  summaryLogFactory.preprocessing({ organisationId, registrationId })
)
```

**Before:**

```javascript
await summaryLogsRepository.insert(summaryLogId, {
  status: SUMMARY_LOG_STATUS.VALIDATED,
  expiresAt: calculateExpiresAt(SUMMARY_LOG_STATUS.VALIDATED),
  organisationId,
  registrationId,
  file: {
    id: 'file-123',
    name: 'test.xlsx',
    status: UPLOAD_STATUS.COMPLETE,
    uri: 's3://test-bucket/test.xlsx'
  }
})
```

**After:**

```javascript
await summaryLogsRepository.insert(
  summaryLogId,
  summaryLogFactory.validated({ organisationId, registrationId })
)
```

### Benefits

1. **Single point of change** - Schema changes only require updating the factories
2. **Tests express intent** - Tests only mention what's relevant to the test
3. **Consistent defaults** - All tests use the same sensible defaults
4. **Type safety** - Each factory guarantees valid objects for its status
5. **Discoverable API** - `summaryLogFactory.` autocomplete shows all options
